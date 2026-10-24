using Climesa.Identity.Application;
using Climesa.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Climesa.Web.Pages.Pacientes;

public class IndexModel(ActorAccessor actors, IdentityService identity) : AppPage(actors)
{
    [BindProperty(SupportsGet = true)] public string? Text { get; set; }
    [BindProperty(SupportsGet = true)] public string? Dui { get; set; }
    [BindProperty(SupportsGet = true)] public string? Mrn { get; set; }
    [BindProperty(SupportsGet = true)] public int? Year { get; set; }
    public SearchResult? Result { get; private set; }

    public async Task OnGetAsync()
    {
        if (string.IsNullOrWhiteSpace(Text) && string.IsNullOrWhiteSpace(Dui) && string.IsNullOrWhiteSpace(Mrn))
        {
            return;
        }
        await Try(async () => Result = await identity.Search(Actor, new SearchCriteria(Text, Dui, Mrn, Year)));
    }
}
