using HtmlAgilityPack;
using Microsoft.AspNetCore.Mvc;
using Sparc.Blossom.Authentication;

namespace Tovik.Translation;

[ApiController]
[Route("proxy")]
public class TovikProxy(IHttpClientFactory factory, IConfiguration config) : ControllerBase
{

    // GET /preview/page?url={encodedUrl}&l={lang}
    [HttpGet("page")]
    public async Task<IActionResult> Page([FromQuery] string url, [FromQuery] string? l = null)
    {
        var domain = new SparcDomain(url).ToUri();
        var remoteUri = SparcDomain.ToNormalizedUri(url);

        if (remoteUri == null)
            return BadRequest("Invalid URL");

        var client = factory.CreateClient();
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; https://tovik.app)");

        using var resp = await client.GetAsync(remoteUri);
        if (!resp.IsSuccessStatusCode)
            return StatusCode((int)resp.StatusCode);

        var html = await resp.Content.ReadAsStringAsync();
        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        // Remove CSP/X-Frame meta tags (we will serve the modified HTML from our origin)
        var metas = doc.DocumentNode.SelectNodes("//meta[@http-equiv]");
        if (metas != null)
        {
            foreach (var m in metas.ToList())
            {
                var ev = m.GetAttributeValue("http-equiv", "").ToLowerInvariant();
                if (ev.Contains("content-security-policy") || ev.Contains("x-frame-options"))
                    m.Remove();
            }
        }

        // Ensure a head and base tag so relative resources resolve to the remote host
        var head = doc.DocumentNode.SelectSingleNode("//head");
        if (head == null)
        {
            head = doc.CreateElement("head");
            doc.DocumentNode.PrependChild(head);
        }

        // Re-write resource URLs to go through this proxy (/proxy/resource?u=...)
        string[] attrs = { "src", "href", "action" };
        var nodesWithAttrs = doc.DocumentNode.SelectNodes("//*[@" + string.Join(" or @", attrs.Select(a => a)) + "]");
        if (nodesWithAttrs != null)
        {
            foreach (var node in nodesWithAttrs)
            {
                if (node.Name == "img")
                    continue;
                
                foreach (var a in attrs)
                {
                    if (!node.Attributes.Contains(a)) continue;
                    var v = node.GetAttributeValue(a, "");
                    if (string.IsNullOrEmpty(v)) continue;
                    var lower = v.Trim().ToLowerInvariant();

                    // skip data:, mailto:, javascript:, blob:
                    if (lower.StartsWith("data:") || lower.StartsWith("mailto:") || lower.StartsWith("javascript:") || lower.StartsWith("blob:"))
                        continue;

                    // Resolve relative URIs against remote page
                    if (!Uri.TryCreate(v, UriKind.Absolute, out var resUri))
                        resUri = new Uri(remoteUri, v);

                    var encoded = Uri.EscapeDataString(resUri.ToString());
                    node.SetAttributeValue(a, $"/proxy/resource?u={encoded}");

                    // links should open inside the iframe
                    if (node.Name == "a")
                        node.SetAttributeValue("target", "_self");
                }
            }
        }

        // Inject tovik script into body and mark attributes
        HtmlNode body = InjectTovikScript(doc);
        body = InjectPushStateScript(doc);

        body.SetAttributeValue("data-tovikdomain", remoteUri.Host);
        body.SetAttributeValue("data-tovikpath", remoteUri.AbsolutePath);

        if (!string.IsNullOrWhiteSpace(l))
            body.SetAttributeValue("data-toviklang", l);

        return Content(doc.DocumentNode.OuterHtml, "text/html");
    }

    private HtmlNode InjectTovikScript(HtmlDocument doc)
    {
        var body = doc.DocumentNode.SelectSingleNode("//body") ?? doc.CreateElement("body");
        var tovik = config["Tovik"]?.TrimEnd('/') ?? "";
        var script = doc.CreateElement("script");
        script.SetAttributeValue("type", "module");
        script.SetAttributeValue("src", $"{tovik}/tovik.js");
        body.AppendChild(script);
        return body;
    }

    private HtmlNode InjectPushStateScript(HtmlDocument doc)
    {
        var body = doc.DocumentNode.SelectSingleNode("//body") ?? doc.CreateElement("body");
        // Small inline script to notify the parent preview when SPA changes the route.
        // This helps routing-based SPAs (Nuxt/Vue/React) keep the preview in sync and preserve the /proxy/page wrapper.
        var inline = @"
(function(){
    function notify(url) {
url ??= location.href;        
try { 
console.log('notifying tovik', url);
parent.postMessage('tovik-url:' + url, '*'); } catch(e) {}
    }

    var _push = history.pushState;
    history.pushState = function(state, title, url) {
        var res = _push.apply(this, arguments);
        notify(url);
        return res;
    };

    var _replace = history.replaceState;
    history.replaceState = function(state, title, url) {
        var res = _replace.apply(this, arguments);
        notify(url);
        return res;
    };

    window.addEventListener('popstate', function() { notify(); });
})();";

        var notifier = doc.CreateElement("script");
        notifier.SetAttributeValue("type", "text/javascript");
        notifier.InnerHtml = inline;
        body.AppendChild(notifier);
        return body;
    }

    // GET /preview/resource?u={encodedUrl}
    [HttpGet("resource")]
    public async Task<IActionResult> Resource([FromQuery] string u)
    {
        if (string.IsNullOrEmpty(u)) return BadRequest();
        var target = Uri.UnescapeDataString(u);
        if (!Uri.TryCreate(target, UriKind.Absolute, out var uri)) return BadRequest();

        var client = factory.CreateClient();
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; https://tovik.app)");

        using var resp = await client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead);
        if (!resp.IsSuccessStatusCode) return StatusCode((int)resp.StatusCode);

        var contentType = resp.Content.Headers.ContentType?.ToString() ?? "application/octet-stream";
        if (resp.Content.Headers.ContentEncoding != null && resp.Content.Headers.ContentEncoding.Count != 0)
            Response.Headers.ContentEncoding = string.Join(", ", resp.Content.Headers.ContentEncoding);

        var memory = new MemoryStream();
        await resp.Content.CopyToAsync(memory);
        memory.Position = 0;

        // Stream the resource with the remote Content-Type
        return File(memory, contentType);
    }

    private bool ShouldProxyResource(HtmlNode node, Uri resUri, string attributeName)
    {
        // Extensions that commonly require proxying (fonts, JS modules, API/json)
        var proxyExts = new[] { ".js", ".json", ".xml", ".woff", ".woff2", ".ttf", ".otf", ".eot" };
        var path = resUri.AbsolutePath ?? "";
        if (proxyExts.Any(ext => path.EndsWith(ext, StringComparison.OrdinalIgnoreCase)))
            return true;

        // Forms should be proxied so submission goes through preview proxy
        if (attributeName == "action")
            return true;

        // Script heuristics: module scripts are fetched with CORS semantics
        if (node.Name == "script")
        {
            var type = node.GetAttributeValue("type", "");
            if (type.IndexOf("module", StringComparison.OrdinalIgnoreCase) >= 0)
                return true;
            if (node.Attributes.Contains("crossorigin") || node.Attributes.Contains("integrity"))
                return true;
        }

        // Links: proxy anchors so navigation stays inside the iframe, but avoid proxying stylesheets by default
        if (node.Name == "link")
        {
            var rel = node.GetAttributeValue("rel", "");
            if (rel.Equals("stylesheet", StringComparison.OrdinalIgnoreCase))
            {
                // Do not proxy stylesheets by default; leave them cross-origin.
                return false;
            }
        }

        // Images can usually be loaded cross-origin; do not proxy by default
        if (node.Name == "img" || node.Name == "picture" || node.Name == "source")
            return false;

        // Anything else: conservative default — do not proxy
        return false;
    }
}
