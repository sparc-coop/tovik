using HtmlAgilityPack;
using Sparc.Blossom.Authentication;
using Sparc.Blossom.Content;
using System.Text.Json.Serialization;

namespace Tovik.Translation;

public record TovikCrawlResult(string Url, string Html, bool IsTovikInstalled);
public class TovikCrawler
{
    HttpClient Client = new() { BaseAddress = new Uri("https://api.cloudflare.com/client/v4/accounts/70e63b236996bce308a10f5618769282/browser-rendering/content") };
    string TovikUrl = "";

    public TovikCrawler(IConfiguration config)
    {
        var apiKey = config.GetConnectionString("Cloudflare");
        Client.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");
        TovikUrl = config["Tovik"]!;
    }

    record GotoOptions(string waitUntil);
    record AddScript(string type, string url);
    record WaitFor(string selector);
    record RenderRequest(string url, string userAgent, Dictionary<string, string> setExtraHTTPHeaders, GotoOptions gotoOptions);
    record RenderError(string code, string message);
    record RenderResponse(bool success, List<RenderError>? errors, string? result);
    public async Task<TovikCrawlResult> PreviewDynamicAsync(SparcDomain domain, Page page, string lang)
    {
        var domainUri = domain.ToUri();
        var url = page.AbsolutePath();

        var request = new RenderRequest(url, 
            "Mozilla/5.0 (compatible; https://tovik.app)", 
            //[new("module", $"{TovikUrl}/tovik.js")],
            new Dictionary<string, string> { { "Accept-Language", lang } },
            new("networkidle0"));

        var result = await Client.PostAsJsonAsync<RenderResponse>("", request);
        if (result == null || result.errors != null || result.result == null)
            throw new Exception("Failed to render page: " + (result?.errors != null ? string.Join(", ", result.errors.Select(e => e.message)) : "Unknown error"));
        
        var isTovikInstalled = result.result?.Contains("tovik.js") == true;

        var doc = new HtmlDocument();
        doc.LoadHtml(result.result!);

        // Inject tovik.js script
        var body = doc.DocumentNode.SelectSingleNode("//body");
        if (body != null)
        {
            if (!isTovikInstalled)
            {
                var script = doc.CreateElement("script");
                script.SetAttributeValue("type", "module");
                script.SetAttributeValue("src", $"{TovikUrl}/tovik.js");
                body.AppendChild(script);
            }

            body.SetAttributeValue("data-tovikdomain", domain.Domain);
            body.SetAttributeValue("data-tovikpath", page.Path);

            // Inject lang into data-lang attribute of html
            if (lang != null)
                body.SetAttributeValue("data-toviklang", lang);
        }

        // Convert all relative links to absolute using base tag
        var baseTag = doc.DocumentNode.SelectSingleNode("//head/base");
        if (baseTag == null)
        {
            var head = doc.DocumentNode.SelectSingleNode("//head");
            if (head == null)
            {
                head = doc.CreateElement("head");
                doc.DocumentNode.PrependChild(head);
            }
            baseTag = doc.CreateElement("base");
            head.PrependChild(baseTag);
        }
        baseTag.SetAttributeValue("href", domainUri.GetLeftPart(UriPartial.Authority));

        // Rewrite links to open in this same Preview.razor
        var links = doc.DocumentNode.SelectNodes("//a[@href]");
        if (links != null)
        {
            foreach (var link in links)
            {
                var href = link.GetAttributeValue("href", "");
                // make the href absolute if needed
                if (Uri.TryCreate(href, UriKind.RelativeOrAbsolute, out var relativeUri) && !relativeUri.IsAbsoluteUri)
                    href = new Uri(domainUri, relativeUri).ToString();

                link.SetAttributeValue("href", "#");
                link.SetAttributeValue("onclick", $"window.parent.postMessage('tovik-url:{href}'); return false;");
            }
        }

        var outerHtml = doc.DocumentNode.OuterHtml;
        return new(url, outerHtml, isTovikInstalled);
    }

    public async Task<TovikCrawlResult> PreviewAsync(SparcDomain domain, Page page, string? lang = null)
    {
        var domainUri = domain.ToUri();

        var handler = new HttpClientHandler()
        {
            AutomaticDecompression = System.Net.DecompressionMethods.All
        };

        var client = new HttpClient(handler);
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; https://tovik.app)");
        var url = page.AbsolutePath(lang);
        string html = await client.GetStringAsync(url);
        var isTovikInstalled = html.Contains("tovik.js");

        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        // Inject tovik.js script
        var body = doc.DocumentNode.SelectSingleNode("//body");
        if (body != null)
        {
            if (!isTovikInstalled)
            {
                var script = doc.CreateElement("script");
                script.SetAttributeValue("type", "module");
                script.SetAttributeValue("src", $"{TovikUrl}/tovik.js");
                body.AppendChild(script);
            }

            body.SetAttributeValue("data-tovikdomain", domain.Domain);
            body.SetAttributeValue("data-tovikpath", page.Path);

            // Inject lang into data-lang attribute of html
            if (lang != null)
                body.SetAttributeValue("data-toviklang", lang);
        }

        // Convert all relative links to absolute using base tag
        var baseTag = doc.DocumentNode.SelectSingleNode("//head/base");
        if (baseTag == null)
        {
            var head = doc.DocumentNode.SelectSingleNode("//head");
            if (head == null)
            {
                head = doc.CreateElement("head");
                doc.DocumentNode.PrependChild(head);
            }
            baseTag = doc.CreateElement("base");
            head.PrependChild(baseTag);
        }
        baseTag.SetAttributeValue("href", domainUri.GetLeftPart(UriPartial.Authority));

        // Rewrite links to open in this same Preview.razor
        var links = doc.DocumentNode.SelectNodes("//a[@href]");
        if (links != null)
        {
            foreach (var link in links)
            {
                var href = link.GetAttributeValue("href", "");
                // make the href absolute if needed
                if (Uri.TryCreate(href, UriKind.RelativeOrAbsolute, out var relativeUri) && !relativeUri.IsAbsoluteUri)
                    href = new Uri(domainUri, relativeUri).ToString();

                link.SetAttributeValue("href", "#");
                link.SetAttributeValue("onclick", $"window.parent.postMessage('tovik-url:{href}'); return false;");
            }
        }

        var result = doc.DocumentNode.OuterHtml;
        return new(url, result, isTovikInstalled);
    }
}
