using Climesa.Care.Application;
using Climesa.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Climesa.Web.Pages.Camas;

public class IndexModel(ActorAccessor actors, CareService care) : AppPage(actors)
{
    public CensusView? Census { get; private set; }
    public IReadOnlyList<CleaningView> Pending { get; private set; } = [];

    public async Task OnGetAsync() => await Load();

    public async Task<IActionResult> OnPostCleanAsync(Guid locationId, int[]? items, DateTime? started, DateTime? ended)
    {
        if (started is null || ended is null)
        {
            ModelState.AddModelError(string.Empty, "Registre la hora real de inicio y fin de la limpieza.");
            await Load();
            return Page();
        }
        var marks = Enumerable.Range(0, CareService.ChecklistItems.Length).Select(i => items?.Contains(i) ?? false).ToList();
        return await Act(() => care.RegisterCleaning(Actor, locationId, marks, FromLocal(started.Value), FromLocal(ended.Value)), "Limpieza registrada; falta la firma de jefatura.");
    }

    /// <summary>Form times are local (America/El_Salvador, UTC-6, no DST); stored as UTC (spec 000 FR-025).</summary>
    private static DateTimeOffset FromLocal(DateTime local) => new DateTimeOffset(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), TimeSpan.FromHours(-6)).ToUniversalTime();

    public Task<IActionResult> OnPostSignAsync(Guid cleaningId) => Act(() => care.SignCleaning(Actor, cleaningId), "Cama liberada.");

    public Task<IActionResult> OnPostBlockAsync(Guid locationId, string? reason) => Act(() => care.SetBlocked(Actor, locationId, true, string.IsNullOrWhiteSpace(reason) ? "sin motivo" : reason), "Cama bloqueada.");

    public Task<IActionResult> OnPostUnblockAsync(Guid locationId) => Act(() => care.SetBlocked(Actor, locationId, false, "desbloqueo"), "Cama disponible.");

    private async Task<IActionResult> Act(Func<Task> action, string message)
    {
        if (await Try(action))
        {
            Flash = message;
            return RedirectToPage();
        }
        await Load();
        return Page();
    }

    private async Task Load()
    {
        await Try(async () => Census = await care.Census(Actor));
        await Try(async () => Pending = await care.PendingCleaningSignatures(Actor));
    }
}
