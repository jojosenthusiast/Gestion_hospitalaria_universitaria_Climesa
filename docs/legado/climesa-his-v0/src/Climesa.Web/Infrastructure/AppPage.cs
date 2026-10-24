using Climesa.Platform.Errors;
using Climesa.Platform.Security;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Climesa.Web.Infrastructure;

/// <summary>Base page: resolves the acting user and turns business errors into visible messages instead of crashes.</summary>
public abstract class AppPage(ActorAccessor actors) : PageModel
{
    protected Actor Actor { get; private set; } = null!;

    [TempData]
    public string? Flash { get; set; }

    public string? ErrorCode { get; private set; }

    public bool Can(string permission) => Actor?.Has(permission) ?? false;

    public override async Task OnPageHandlerExecutionAsync(PageHandlerExecutingContext context, PageHandlerExecutionDelegate next)
    {
        var actor = await actors.Current();
        if (actor is null)
        {
            context.Result = new RedirectToPageResult("/Cuenta/Login", new { returnUrl = Request.Path + Request.QueryString });
            return;
        }
        Actor = actor;
        await next();
    }

    /// <summary>Runs an action; a DomainError becomes a page error with its code, everything else propagates.</summary>
    protected async Task<bool> Try(Func<Task> action)
    {
        try
        {
            await action();
            return true;
        }
        catch (DomainError e)
        {
            ErrorCode = e.Code;
            ModelState.AddModelError(string.Empty, e.Message);
            return false;
        }
    }

    protected static string NewKey() => Guid.NewGuid().ToString("N");
}
