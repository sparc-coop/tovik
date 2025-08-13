using Sparc.Blossom.Data;
using Sparc.Blossom.Authentication;

namespace Tovik.Domains;

public class TovikDomains(BlossomAggregateOptions<SparcDomain> options) 
    : BlossomAggregate<SparcDomain>(options)
{
   public async Task<List<SparcDomain>> All()
        => await Repository.Query
            .Where(x => x.TovikUserId == User.Id())
            .ToListAsync();


    public async Task RegisterAsync(string domainName)
    {
        var host = SparcDomain.Normalize(domainName) 
            ?? throw new ArgumentException("Invalid domain name.", nameof(domainName));
        
        var existing = await Repository.Query
            .Where(d => d.Domain == host)
            .FirstOrDefaultAsync();

        if (existing == null)
        {
            existing = new SparcDomain(host);
            await Repository.AddAsync(existing);
        }

        if (existing.TovikUserId != null)
            throw new Exception("This domain is already registered with Tovik.");
        
        existing.TovikUserId = User.Id();
        await Repository.UpdateAsync(existing);
    }

    public async Task DeleteAsync(SparcDomain domain)
    {
        domain.TovikUserId = null;
        await Repository.UpdateAsync(domain);
    }
}
