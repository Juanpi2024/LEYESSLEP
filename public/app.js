// Compatibilidad temporal con la portada anterior.
// Fuerza una URL nueva para que el navegador solicite el HTML actualizado.
(() => {
  const version = "20260730-2";
  const currentUrl = new URL(window.location.href);

  if (currentUrl.searchParams.get("actualizacion") !== version) {
    currentUrl.pathname = "/";
    currentUrl.hash = "";
    currentUrl.search = "";
    currentUrl.searchParams.set("actualizacion", version);
    window.location.replace(currentUrl.toString());
  }
})();
