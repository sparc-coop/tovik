using Sparc.Blossom.Authentication;
using Sparc.Blossom.Content;
using Sparc.Blossom.Data;

namespace Tovik.Domains;

public class TovikDomains(BlossomAggregateOptions<SparcDomain> options, IRepository<Page> pages)
    : BlossomAggregate<SparcDomain>(options)
{
    public async Task<List<SparcDomain>> All()
         => await Repository.Query
             .Where(x => x.TovikUserId == User.Id() || x.Users.Contains(User.Id()))
             .ToListAsync();

    public async Task<Page> GetPage(string domainName, string path)
    {
        var result = await pages.Query
            .Where(p => p.Domain == domainName && p.Path == path)
            .FirstOrDefaultAsync();

        if (result == null)
        {
            result = new Page(domainName, path, path);
            await pages.AddAsync(result);
        }

        return result;
    }

    public async Task<List<Page>> GetPages(string domainName)
    {
        var result = await pages.Query
            .Where(p => p.Domain == domainName)
            .ToListAsync();

        return result.OrderByDescending(x => x.TovikUsage.Sum(y => y.Value)).ToList();
    }

    public async Task<SparcDomain?> Verify(string? url)
    {
        if (url == null)
            return null;

        try
        {
            var domain = new SparcDomain(url);
            var page = SparcDomain.ToNormalizedUri(url);

            if (page == null || domain == null)
                return null;

            var existing = await Repository.Query
                .Where(d => d.Domain == domain.Domain)
                .FirstOrDefaultAsync();

            return existing ?? domain;
        }
        catch { return null; }
    }

    public async Task<(SparcDomain? Domain, Page? Page)> GetDomainAndPage(string url)
    {
        var uri = SparcDomain.ToNormalizedUri(url);
        if (uri == null)
            return (null, null);

        var domain = await Repository.Query
            .Where(d => d.Domain == uri.Host)
            .FirstOrDefaultAsync();

        if (domain == null)
        {
            domain = new SparcDomain(uri.Host);
            await Repository.AddAsync(domain);
        }

        var page = await pages.Query
            .Where(p => p.Domain == domain.Domain && p.Path == uri.AbsolutePath)
            .FirstOrDefaultAsync();

        if (page == null)
        {
            page = new Page(domain.Domain, uri.AbsolutePath, uri.AbsolutePath);
            await pages.AddAsync(page);
        }

        return (domain, page);
    }

    public async Task<SparcDomain> RegisterAsync(string domainName)
    {
        var host = SparcDomain.Normalize(domainName)
            ?? throw new ArgumentException("Invalid domain name.", nameof(domainName));

        var existing = await Repository.Query
            .Where(d => d.Domain == host)
            .FirstOrDefaultAsync();

        if (existing == null)
        {
            existing = new SparcDomain(host)
            {
                Users = [User.Id()]
            };
            await Repository.AddAsync(existing);
        }

        if (existing.TovikUserId == null && !existing.Users.Contains(User.Id()))
        {
            existing.Users.Add(User.Id());
            await Repository.UpdateAsync(existing);
        }

        if (!existing.CanBeAccessedBy(User))
            throw new Exception("This domain is already registered with Tovik.");

        return existing;
    }

    public async Task DeleteAsync(SparcDomain domain)
    {
        if (domain.Users.Contains(User.Id()))
        {
            domain.Users.Remove(User.Id());
            await Repository.UpdateAsync(domain);
        }

        if (domain.TovikUserId == User.Id())
        {
            domain.TovikUserId = null;
            await Repository.UpdateAsync(domain);
        }
    }
}
