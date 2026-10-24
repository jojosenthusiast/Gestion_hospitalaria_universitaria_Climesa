using Climesa.Care.Application;
using Climesa.Identity.Contracts;
using Climesa.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Climesa.Web.Pages.Hospitalizacion;

public class IngresarModel(ActorAccessor actors, CareService care, IIdentityModule identity) : AppPage(actors)
{
    [BindProperty(SupportsGet = true)] public Guid? EncounterId { get; set; }
    [BindProperty(SupportsGet = true)] public Guid PersonId { get; set; }
    [BindProperty] public string Key { get; set; } = NewKey();
    public PersonSummary? Patient { get; private set; }
    public IReadOnlyList<(Guid Id, string Code, string Unit)> Beds { get; private set; } = [];
    public string ResponsibleDefault => Actor.DisplayName;

    public async Task OnGetAsync() => await Load();

    public async Task<IActionResult> OnPostAsync(Guid locationId, string service, string responsible)
    {
        Guid episode = Guid.Empty;
        if (await Try(async () => episode = await care.Admit(Actor, PersonId, EncounterId, locationId, service, responsible, Key)))
        {
            Flash = "Paciente ingresado.";
            return Redirect($"/Hospitalizacion/Episodio/{episode}");
        }
        await Load();
        return Page();
    }

    private async Task Load()
    {
        Patient = await identity.GetSummary(PersonId);
        await Try(async () => Beds = await care.AvailableBeds(Actor));
    }
}
