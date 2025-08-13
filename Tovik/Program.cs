using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Sparc.Blossom.Data;
using Sparc.Blossom.Engine;
using Tovik;
using Tovik.Domains;

var builder = BlossomApplication.CreateBuilder<Html>(args);

var dbName = builder.Configuration["Tovik"]!.Contains("localhost") ? "sparc-dev" : "sparc";
builder.Services.AddCosmos<TovikContext>(builder.Configuration.GetConnectionString("Cosmos")!, dbName, ServiceLifetime.Scoped);
builder.Services.AddBlossomEngine(builder.Configuration["SparcEngine"]);

builder.Services.AddDataProtection()
    .SetApplicationName("Tovik")
    .PersistKeysToAzureBlobStorage(builder.Configuration.GetConnectionString("Storage")!, "dataprotection", "Tovik.xml");


builder.Services.AddScoped<TovikDomains>();
builder.Services.AddScoped<ICorsPolicyProvider, TovikDomainPolicyProvider>();
builder.Services.AddCors();
builder.Services.AddHybridCache();

var app = builder.Build();
await app.RunAsync<Html>();