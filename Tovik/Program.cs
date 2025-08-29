using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Sparc.Blossom.Data;
using Sparc.Blossom.Engine;
using Sparc.Blossom.Platforms.Server;
using Tovik;
using Tovik.Domains;
using Tovik.Translation;

var builder = BlossomApplication.CreateBuilder<Html>(args);

var dbName = builder.Configuration["Tovik"]!.Contains("localhost") ? "sparc-dev" : "sparc";
builder.Services.AddCosmos<TovikContext>(builder.Configuration.GetConnectionString("Cosmos")!, dbName, ServiceLifetime.Scoped);
builder.Services.AddBlossomEngine(builder.Configuration["SparcEngine"]);
builder.Services.AddControllers();
builder.Services.AddDataProtection()
    .SetApplicationName("Tovik")
    .PersistKeysToAzureBlobStorage(builder.Configuration.GetConnectionString("Storage")!, "dataprotection", "Tovik.xml");


builder.Services.AddScoped<TovikDomains>()
    .AddScoped<TovikCrawler>();
builder.Services.AddScoped<ICorsPolicyProvider, TovikDomainPolicyProvider>();
builder.Services.AddCors();
builder.Services.AddHybridCache();

var app = builder.Build();

if (app is BlossomServerApplication server)
    server.Host.MapGet("/preview", async (TovikCrawler crawler, string url, string? lang) => Results.Content(await crawler.PreviewAsync(url, lang), "text/html"));
await app.RunAsync<Html>();