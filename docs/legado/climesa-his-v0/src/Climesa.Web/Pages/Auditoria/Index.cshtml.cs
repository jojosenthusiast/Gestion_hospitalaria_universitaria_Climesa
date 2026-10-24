using Climesa.Platform.Audit;
using Climesa.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Climesa.Web.Pages.Auditoria;

public class IndexModel(ActorAccessor actors, AuditReader reader, AuditVerifier verifier) : AppPage(actors)
{
    public IReadOnlyList<AuditRow> Rows { get; private set; } = [];
    public ChainCheckResult? Check { get; private set; }

    public async Task OnGetAsync() => await Try(async () => Rows = await reader.Recent(Actor));

    public async Task<IActionResult> OnPostAsync()
    {
        if (!Can("audit.verify"))
        {
            ModelState.AddModelError(string.Empty, "No tiene permiso para verificar la cadena.");
        }
        else
        {
            Check = await verifier.Verify();
        }
        await OnGetAsync();
        return Page();
    }
}
