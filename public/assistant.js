(() => {
  const form = document.getElementById("assistant-form");
  const input = document.getElementById("assistant-question");
  const submit = document.getElementById("assistant-submit");
  const messages = document.getElementById("assistant-messages");
  const quickQuestions = document.querySelectorAll("[data-question]");
  const submitLabel = submit?.querySelector("span");

  if (!form || !input || !submit || !messages) return;

  const addMessage = (type, text) => {
    const empty = messages.querySelector(".assistant-empty");
    if (empty) empty.remove();

    const item = document.createElement("div");
    item.className = `assistant-message ${type}`;

    const label = document.createElement("strong");
    label.textContent = type === "user" ? "Tu pregunta" : "Orientación";

    const content = document.createElement("div");
    content.className = "assistant-message-content";
    content.textContent = text;

    item.append(label, content);
    messages.appendChild(item);
    item.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const ask = async (question) => {
    const cleanQuestion = question.trim();
    if (cleanQuestion.length < 5) return;

    addMessage("user", cleanQuestion);
    input.value = "";
    input.disabled = true;
    submit.disabled = true;
    if (submitLabel) submitLabel.textContent = "Consultando…";

    const loading = document.createElement("div");
    loading.className = "assistant-loading";
    loading.textContent = "Revisando la orientación normativa…";
    messages.appendChild(loading);

    try {
      const response = await fetch("/api/consultar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta: cleanQuestion }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No fue posible responder.");
      }

      addMessage("assistant", `${data.respuesta}\n\n${data.aviso}`);
    } catch (error) {
      addMessage("assistant", error.message || "No fue posible responder. Revisa las fuentes oficiales disponibles en esta página.");
    } finally {
      loading.remove();
      input.disabled = false;
      submit.disabled = false;
      if (submitLabel) submitLabel.textContent = "Enviar";
      input.focus();
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    ask(input.value);
  });

  quickQuestions.forEach((button) => {
    button.addEventListener("click", () => ask(button.dataset.question || ""));
  });
})();
