using System.Reflection;
using System.Text.RegularExpressions;

namespace Climesa.Tests;

/// <summary>Module boundaries (constitution: module = own schema + contracts).</summary>
public static partial class ArchitectureTests
{
    private static readonly string[] Modules = ["Identity", "Care", "Migration"];

    [Test("000 module boundaries")]
    public static void ModulesReferenceOnlyContractsOfOtherModules()
    {
        foreach (var module in Modules)
        {
            var asm = Assembly.Load($"Climesa.{module}");
            var refs = asm.GetReferencedAssemblies().Select(r => r.Name!).Where(n => n.StartsWith("Climesa.", StringComparison.Ordinal)).ToList();
            foreach (var r in refs)
            {
                var allowed = r == "Climesa.Platform" || r.EndsWith(".Contracts", StringComparison.Ordinal);
                Assert.True(allowed, $"Climesa.{module} referencia {r}; solo puede usar Platform y contratos de otros módulos");
            }
        }
    }

    [Test("000 module boundaries")]
    public static void ModuleCodeDoesNotQueryOtherSchemas()
    {
        var root = FindRepoRoot();
        foreach (var module in Modules)
        {
            var schema = module.ToLowerInvariant();
            var others = new[] { "identity", "care", "migration" }.Where(s => s != schema).ToArray();
            foreach (var file in Directory.EnumerateFiles(Path.Combine(root, "src", "Modules", module), "*.*", SearchOption.AllDirectories)
                         .Where(f => (f.EndsWith(".cs", StringComparison.Ordinal) || f.EndsWith(".sql", StringComparison.Ordinal)) && !f.Contains("/obj/", StringComparison.Ordinal) && !f.Contains("/bin/", StringComparison.Ordinal)))
            {
                var text = File.ReadAllText(file);
                foreach (var other in others)
                {
                    var hit = Regex.IsMatch(text, $@"\b(from|join|into|update)\s+{other}\.", RegexOptions.IgnoreCase);
                    Assert.True(!hit, $"{Path.GetFileName(file)} del módulo {module} consulta el esquema {other}");
                }
            }
        }
    }

    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Climesa.slnx")))
        {
            dir = dir.Parent;
        }
        return dir?.FullName ?? throw new InvalidOperationException("No se encontró la raíz del repositorio");
    }
}
