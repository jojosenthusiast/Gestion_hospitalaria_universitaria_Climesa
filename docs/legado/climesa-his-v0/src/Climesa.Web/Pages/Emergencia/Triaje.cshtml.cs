using Climesa.Care.Application;
using Climesa.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Climesa.Web.Pages.Emergencia;

public class TriajeModel(ActorAccessor actors, CareService care) : AppPage(actors)
{
    [BindProperty(SupportsGet = true)] public Guid Id { get; set; }

    public void OnGet()
    {
    }

    public async Task<IActionResult> OnPostAsync(int level, string? discriminator, string? bloodPressure, int? heartRate, int? respiratoryRate, decimal? temperature, int? spO2, int? pain)
    {
        if (await Try(() => care.RecordTriage(Actor, new TriageInput(Id, level, null, discriminator ?? "", bloodPressure, heartRate, respiratoryRate, temperature, spO2, pain))))
        {
            Flash = "Triaje registrado.";
            return Redirect("/Emergencia");
        }
        return Page();
    }
}
