using System.Security.Claims;
using Climesa.Platform.Audit;
using Climesa.Platform.Data;
using Climesa.Platform.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Climesa.Web.Pages.Cuenta;

public class LoginModel(UserStore users, Db db, AuditWriter audit) : PageModel
{
    [BindProperty] public string? Username { get; set; }
    [BindProperty] public string? Password { get; set; }
    [BindProperty(SupportsGet = true)] public string? ReturnUrl { get; set; }
    public string? Error { get; set; }

    public void OnGet()
    {
    }

    public async Task<IActionResult> OnPostAsync()
    {
        var user = string.IsNullOrWhiteSpace(Username) ? null : await users.FindByUsername(Username.Trim());
        var ok = user is not null && user.Active && Password is not null && PasswordHasher.Verify(Password, user.PasswordHash);
        var actor = ok
            ? new Actor(user!.Id, user.Username, user.DisplayName, new HashSet<string>(), null, null, null, "web", HttpContext.Connection.RemoteIpAddress?.ToString(), HttpContext.TraceIdentifier)
            : Actor.System(HttpContext.TraceIdentifier) with { Username = Username ?? "", Ip = HttpContext.Connection.RemoteIpAddress?.ToString() };
        await db.InTx(tx => audit.Write(tx, actor, new AuditEntry("login", "session", Outcome: ok ? "success" : "denied")));
        if (!ok)
        {
            Error = "Usuario o contraseña incorrectos.";
            return Page();
        }
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, user!.Id.ToString()), new Claim(ClaimTypes.Name, user.Username)], CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
        return LocalRedirect(Url.IsLocalUrl(ReturnUrl) ? ReturnUrl! : "/");
    }
}
