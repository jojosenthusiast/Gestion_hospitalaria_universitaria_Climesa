using Climesa.Web.Infrastructure;

namespace Climesa.Web.Pages;

public class IndexModel(ActorAccessor actors) : AppPage(actors)
{
    public string Name => Actor.DisplayName;

    public void OnGet()
    {
    }
}
