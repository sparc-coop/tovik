using Sparc.Blossom.Authentication;
using Sparc.Blossom.Content;
using Sparc.Blossom.Data;

namespace Tovik.Domains;

public class TovikDomains(BlossomAggregateOptions<SparcDomain> options, IRepository<Page> pages) 
    : BlossomAggregate<SparcDomain>(options)
{
   public async Task<List<SparcDomain>> All()
        => await Repository.Query
            .Where(x => x.TovikUserId == User.Id())
            .ToListAsync();

    public async Task<List<Page>> GetPages(string domainName)
    {
        var result = await pages.Query
            .Where(p => p.Domain == domainName)
            .ToListAsync();

        return result.OrderByDescending(x => x.TovikUsage.Sum(y => y.Value)).ToList();
    }

    public async Task<SparcDomain?> Verify(string url)
    {
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

    public async Task<SparcDomain> RegisterAsync(string domainName)
    {
        var host = SparcDomain.Normalize(domainName) 
            ?? throw new ArgumentException("Invalid domain name.", nameof(domainName));
        
        var existing = await Repository.Query
            .Where(d => d.Domain == host)
            .FirstOrDefaultAsync();

        if (existing == null)
        {
            existing = new SparcDomain(host);
            if (!await existing.VerifyAsync())
                throw new Exception($"{host} does not contain the expected Tovik script: https://tovik.app/tovik.js. Please ensure Tovik is installed correctly on this domain.");

            await Repository.AddAsync(existing);
        }

        if (existing.TovikUserId != null)
            throw new Exception("This domain is already registered with Tovik.");

        if (existing.DateConnected == null && !await existing.VerifyAsync())
            throw new Exception($"{host} does not contain the expected Tovik script: https://tovik.app/tovik.js. Please ensure Tovik is installed correctly on this domain.");

        existing.TovikUserId = User.Id();
        existing.Fulfill(new Sparc.Blossom.Billing.SparcProduct("Tovik") { MaxUsage = 20 }, User.Id());
        await Repository.UpdateAsync(existing);

        return existing;
    }

    public async Task DeleteAsync(SparcDomain domain)
    {
        domain.TovikUserId = null;
        await Repository.UpdateAsync(domain);
    }
}
