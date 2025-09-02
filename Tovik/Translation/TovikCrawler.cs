using HtmlAgilityPack;
using Sparc.Blossom.Authentication;

namespace Tovik.Translation;

public class TovikCrawler(IConfiguration config)
{
    public async Task<string> PreviewAsync(string url, string? lang)
    {
        var domain = new SparcDomain(url).ToUri();
        var page = SparcDomain.ToNormalizedUri(url);
        var web = new HtmlWeb();
        var doc = web.Load(page);
        var tovik = config["Tovik"];

        // Inject tovik.js script
        var body = doc.DocumentNode.SelectSingleNode("//body");
        if (body != null)
        {
            var script = doc.CreateElement("script");
            script.SetAttributeValue("type", "module");
            script.SetAttributeValue("src", $"{tovik}/tovik.js");
            body.AppendChild(script);

            body.SetAttributeValue("data-tovikdomain", domain.Host);
            body.SetAttributeValue("data-tovikpath", domain.AbsolutePath);

            // Inject lang into data-lang attribute of html
            if (lang != null)
                body.SetAttributeValue("data-toviklang", lang);
        }

        // Convert all relative links to absolute using base tag
        var baseTag = doc.DocumentNode.SelectSingleNode("//head/base");
        if (baseTag == null)
        {
            var head = doc.DocumentNode.SelectSingleNode("//head");
            baseTag = doc.CreateElement("base");
            head.PrependChild(baseTag);
        }
        baseTag.SetAttributeValue("href", domain.GetLeftPart(UriPartial.Authority));

        // Rewrite links to open in this same Preview.razor
        var links = doc.DocumentNode.SelectNodes("//a[@href]");
        if (links != null)
        {
            foreach (var link in links)
            {
                var href = link.GetAttributeValue("href", "");
                // make the href absolute if needed
                if (Uri.TryCreate(href, UriKind.RelativeOrAbsolute, out var uri) && !uri.IsAbsoluteUri)
                    href = new Uri(domain, uri).ToString();

                link.SetAttributeValue("href", $"{tovik}/internalpreview?url={href}" + (lang != null ? $"&previewlang={lang}" : ""));
            }
        }

        // Escape entities as needed for iframe srcdoc
        var html = doc.DocumentNode.OuterHtml;
        return html;
    }
}
