using Climesa.Care.Application;
using Climesa.Identity.Application;
using Climesa.Identity.Contracts;
using Climesa.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Climesa.Web.Pages.Emergencia;

public class IndexModel(ActorAccessor actors, CareService care, IdentityService identity) : AppPage(actors)
{
    public IReadOnlyList<BoardRow> Board { get; private set; } = [];
    [BindProperty] public string Key { get; set; } = NewKey();

    public async Task OnGetAsync() => await Load();

    public async Task<IActionResult> OnPostArrivalAsync(string? mrn, string arrivalMode, string? description, int? estimatedAge, string sex)
    {
        var ok = await Try(async () =>
        {
            Guid? personId = null;
            if (!string.IsNullOrWhiteSpace(mrn))
            {
                var found = await identity.Search(Actor, new SearchCriteria(null, null, mrn, null));
                personId = found.Candidates.FirstOrDefault()?.PersonId
                    ?? throw new Climesa.Platform.Errors.DomainError("mrn_not_found", "No existe ese expediente. Deje el campo vacío para registrar como provisional.");
            }
            await care.RegisterEmergencyArrival(Actor, new EmergencyArrival(personId, personId is null ? new ProvisionalRegistration(description, null, sex, estimatedAge) : null, arrivalMode, null), Key);
        });
        if (ok)
        {
            Flash = "Llegada registrada.";
            return RedirectToPage();
        }
        await Load();
        return Page();
    }

    public async Task<IActionResult> OnPostPhysicianAsync(Guid encounterId)
    {
        if (await Try(() => care.RecordFirstPhysicianContact(Actor, encounterId)))
        {
            Flash = "Primer contacto médico registrado.";
            return RedirectToPage();
        }
        await Load();
        return Page();
    }

    private async Task Load() => await Try(async () => Board = await care.EmergencyBoard(Actor));
}
