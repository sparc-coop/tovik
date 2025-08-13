using Microsoft.EntityFrameworkCore;
using Sparc.Blossom.Authentication;
using Sparc.Blossom.Content;

internal class TovikContext(DbContextOptions<TovikContext> options) : DbContext(options)
{
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<SparcDomain>().ToContainer("Domains")
            .HasPartitionKey(x => x.Domain)
            .HasKey(x => x.Id);

        model.Entity<TextContent>().ToContainer("TextContent")
            .HasPartitionKey(x => x.Domain)
            .HasKey(x => x.Id);
    }
}