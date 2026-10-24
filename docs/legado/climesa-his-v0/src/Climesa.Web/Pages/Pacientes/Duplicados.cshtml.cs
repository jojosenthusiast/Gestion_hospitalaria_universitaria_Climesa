using Climesa.Identity.Application;
using Climesa.Web.Infrastructure;

namespace Climesa.Web.Pages.Pacientes;

public class DuplicadosModel(ActorAccessor actors, IdentityService identity) : AppPage(actors)
{
    public IReadOnlyList<CaseView> Cases { get; private set; } = [];

    public async Task OnGetAsync() => await Try(async () => Cases = await identity.OpenCases(Actor));
}
