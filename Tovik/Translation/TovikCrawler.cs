using HtmlAgilityPack;
using Sparc.Blossom.Authentication;
using Sparc.Blossom.Content;

namespace Tovik.Translation;

public class TovikCrawler(IConfiguration config)
{
    public async Task<string> PreviewAsync(SparcDomain domain, Page page, string? lang = null)
    {
        var domainUri = domain.ToUri();

        var handler = new HttpClientHandler()
        {
            AutomaticDecompression = System.Net.DecompressionMethods.All
        };

        var client = new HttpClient(handler);
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; https://tovik.app)");
        string html = await client.GetStringAsync(page.AbsolutePath(lang));

        var doc = new HtmlDocument();
        doc.LoadHtml(html);
        var tovik = config["Tovik"];

        // Inject tovik.js script
        var body = doc.DocumentNode.SelectSingleNode("//body");
        if (body != null)
        {
            var script = doc.CreateElement("script");
            script.SetAttributeValue("type", "module");
            script.SetAttributeValue("src", $"{tovik}/tovik.js");
            body.AppendChild(script);

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
        return result;
    }
}
