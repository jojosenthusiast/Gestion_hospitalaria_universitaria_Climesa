using Climesa.Migration.Application;
using Climesa.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Climesa.Web.Pages.Migracion;

public class IndexModel(ActorAccessor actors, MigrationService migration) : AppPage(actors)
{
    public IReadOnlyList<BatchSummary> Batches { get; private set; } = [];

    public async Task OnGetAsync() => await Try(async () => Batches = await migration.List(Actor));

    public async Task<IActionResult> OnPostAsync(IFormFile? file)
    {
        if (file is null || file.Length == 0)
        {
            ModelState.AddModelError(string.Empty, "Seleccione un archivo CSV.");
            await OnGetAsync();
            return Page();
        }
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        BatchSummary? result = null;
        if (await Try(async () => result = await migration.LoadArchiveIndex(Actor, file.FileName, ms.ToArray())))
        {
            Flash = result!.AlreadyApplied
                ? "Ese archivo ya se cargó con la misma versión de transformación; no se repitió ningún efecto."
                : $"Lote {Labels.Es(result.Status)}: {result.Read} filas leídas = {result.Created} creadas + {result.Matched} encontradas + {result.Rejected} rechazadas + {result.Pending} pendientes.";
            return Redirect($"/Migracion/Lote/{result.Id}");
        }
        await OnGetAsync();
        return Page();
    }
}
