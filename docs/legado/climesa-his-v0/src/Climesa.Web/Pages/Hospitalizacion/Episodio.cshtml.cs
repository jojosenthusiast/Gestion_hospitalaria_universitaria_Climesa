using Climesa.Care.Application;
using Climesa.Identity.Contracts;
using Climesa.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Climesa.Web.Pages.Hospitalizacion;

public class EpisodioModel(ActorAccessor actors, CareService care, IIdentityModule identity) : AppPage(actors)
{
    [BindProperty(SupportsGet = true)] public Guid Id { get; set; }
    public EpisodeView? Episode { get; private set; }
    public PersonSummary? Patient { get; private set; }

    public async Task OnGetAsync() => await Load();

    public async Task<IActionResult> OnPostDischargeAsync(string type, string? risksExplained, string? voluntaryForm, string? witness1, string? witness2,
        string? destination, string? receiver, string? deathCertifier, string? pending1, string? owner1, string? pending2, string? owner2)
    {
        var pending = new List<PendingItem>();
        if (!string.IsNullOrWhiteSpace(pending1)) { pending.Add(new PendingItem(pending1, owner1 ?? "")); }
        if (!string.IsNullOrWhiteSpace(pending2)) { pending.Add(new PendingItem(pending2, owner2 ?? "")); }
        var input = new DischargeInput(Id, type, null, voluntaryForm, witness1, witness2, risksExplained, destination, receiver, deathCertifier, pending);
        return await Act(() => care.SignMedicalDischarge(Actor, input), "Alta médica firmada.");
    }

    public Task<IActionResult> OnPostExitAsync() => Act(() => care.RecordPhysicalExit(Actor, Id), "Salida física registrada; la cama quedó pendiente de limpieza.");

    public Task<IActionResult> OnPostRevokeAsync(string? reason) => Act(() => care.RevokeMedicalDischarge(Actor, Id, reason ?? ""), "Alta revocada; el episodio vuelve a estar activo.");

    private async Task<IActionResult> Act(Func<Task> action, string message)
    {
        if (await Try(action))
        {
            Flash = message;
            return RedirectToPage(new { Id });
        }
        await Load();
        return Page();
    }

    private async Task Load()
    {
        await Try(async () => Episode = await care.Episode(Actor, Id));
        if (Episode is not null)
        {
            Patient = await identity.GetSummary(Episode.PersonId);
        }
    }
}
