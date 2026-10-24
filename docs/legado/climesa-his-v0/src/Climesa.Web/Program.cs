using System.Globalization;
using Climesa.Platform.Data;
using Climesa.Platform.Messaging;
using Climesa.Platform.Time;
using Climesa.Web.Infrastructure;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Localization;

var builder = WebApplication.CreateBuilder(args);

var appCs = builder.Configuration.GetConnectionString("App") ?? throw new InvalidOperationException("ConnectionStrings:App is required.");
var ownerCs = builder.Configuration.GetConnectionString("Owner") ?? throw new InvalidOperationException("ConnectionStrings:Owner is required.");

builder.Services.AddClimesa(new DbOptions(appCs, ownerCs), new SystemClock());
builder.Services.AddHttpContextAccessor();
builder.Services.AddHostedService<OutboxBackgroundService>();
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.LoginPath = "/Cuenta/Login";
        o.LogoutPath = "/Cuenta/Salir";
        o.Cookie.Name = "climesa.auth";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Strict;
        o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        o.ExpireTimeSpan = TimeSpan.FromMinutes(30);
        o.SlidingExpiration = true;
    });
builder.Services.AddAuthorization(o => o.FallbackPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
builder.Services.AddRazorPages(o => o.Conventions.AllowAnonymousToFolder("/Cuenta"));

var app = builder.Build();

if (builder.Configuration.GetValue<bool>("Climesa:ApplyMigrations"))
{
    await Migrator.Apply(ownerCs, Composition.MigrationSources);
}
if (builder.Configuration.GetValue<bool>("Climesa:SeedDemo"))
{
    await DemoSeeder.Seed(ownerCs, Composition.FacilityId);
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

var culture = new CultureInfo("es-SV");
app.UseRequestLocalization(new RequestLocalizationOptions
{
    DefaultRequestCulture = new RequestCulture(culture),
    SupportedCultures = [culture],
    SupportedUICultures = [culture],
});
app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.MapRazorPages();

await app.RunAsync();

public partial class Program;
