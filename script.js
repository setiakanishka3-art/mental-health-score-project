(() => {
  "use strict";

  const isLocalPage =
    window.location.protocol === "file:" ||
    ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const isLocalStaticServer =
    isLocalPage && window.location.port !== "2200";
  const API_BASE = isLocalStaticServer
    ? "http://127.0.0.1:2200"
    : window.location.origin;

  const form = document.getElementById("predict-form");
  const submitBtn = document.getElementById("submit-btn");
  const resetBtn = document.getElementById("reset-btn");
  const errorRetryBtn = document.getElementById("error-retry-btn");

  const stateIdle = document.getElementById("state-idle");
  const stateLoading = document.getElementById("state-loading");
  const stateResult = document.getElementById("state-result");
  const stateError = document.getElementById("state-error");

  const scoreNumberEl = document.getElementById("score-number");
  const scoreBandEl = document.getElementById("score-band");
  const scoreContextEl = document.getElementById("score-context");
  const gaugeFill = document.getElementById("gauge-fill");
  const errorLabelEl = document.getElementById("error-label");
  const errorCopyEl = document.getElementById("error-copy");
  const lifestyleChart = document.getElementById("lifestyle-chart");
  const reportedFacts = document.getElementById("reported-facts");
  const predictionChart = document.getElementById("prediction-chart");
  const wellnessSuggestions = document.getElementById("wellness-suggestions");
  const modelComparisonBody = document.getElementById("model-comparison-body");
  const wellnessPlan = document.getElementById("wellness-plan");
  const refreshPlanBtn = document.getElementById("refresh-plan-btn");
  const planProgress = document.getElementById("plan-progress");
  const planProgressCount = document.getElementById("plan-progress-count");
  const planProgressPercent = document.getElementById("plan-progress-percent");
  const planLists = {
    morning: document.getElementById("plan-morning"),
    afternoon: document.getElementById("plan-afternoon"),
    evening: document.getElementById("plan-evening"),
  };

  const GAUGE_ARC_LENGTH = 314; // approx pi * r(100)
  const predictionHistory = [];
  let currentPlanInputs = null;
  let planVersion = 0;

  // ---------------------------------------------------------
  // Draw tick marks on both gauges (0..10, every 2 units)
  // ---------------------------------------------------------
  function drawTicks() {
    document.querySelectorAll(".gauge-ticks").forEach((g) => {
      g.innerHTML = "";
      const cx = 120, cy = 140, rOuter = 100, rInner = 90;
      for (let i = 0; i <= 10; i += 2) {
        const angle = Math.PI - (i / 10) * Math.PI; // 180deg -> 0deg
        const x1 = cx + rOuter * Math.cos(angle);
        const y1 = cy - rOuter * Math.sin(angle);
        const x2 = cx + rInner * Math.cos(angle);
        const y2 = cy - rInner * Math.sin(angle);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1.toFixed(1));
        line.setAttribute("y1", y1.toFixed(1));
        line.setAttribute("x2", x2.toFixed(1));
        line.setAttribute("y2", y2.toFixed(1));
        g.appendChild(line);
      }
    });
  }
  drawTicks();

  // ---------------------------------------------------------
  // Segmented control (stress_level) wiring
  // ---------------------------------------------------------
  const segGroup = document.getElementById("stress_level_group");
  const stressHiddenInput = document.getElementById("stress_level");
  segGroup.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      segGroup.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      stressHiddenInput.value = btn.dataset.value;
      clearFieldError(stressHiddenInput);
    });
  });

  // ---------------------------------------------------------
  // Field-level error helpers
  // ---------------------------------------------------------
  function fieldWrapper(input) {
    return input.closest(".field");
  }

  function setFieldError(input, message) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.add("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = message;
  }

  function clearFieldError(input) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.remove("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = "";
  }

  function clearAllErrors() {
    form.querySelectorAll(".field").forEach((f) => f.classList.remove("field-error"));
    form.querySelectorAll(".error-msg").forEach((m) => (m.textContent = ""));
  }

  // ---------------------------------------------------------
  // Client-side validation mirroring the StudentData model
  // ---------------------------------------------------------
  function validate(payload) {
    const errors = [];

    const numericChecks = [
      ["age", 10, 100, true],
      ["avg_daily_usage_hours", 0, 24, false],
      ["daily_unlocks", 0, 273, true],
      ["study_hours", 0, 24, false],
      ["physical_activity_hours", 0, 24, false],
      ["sleep_hours_per_night", 0, 24, false],
    ];

    numericChecks.forEach(([key, min, max, mustBeInteger]) => {
      const input = document.getElementById(key);
      const val = payload[key];
      if (!Number.isFinite(val)) {
        errors.push([input, "This field is required."]);
      } else if (val < min || val > max) {
        errors.push([input, `Must be between ${min} and ${max}.`]);
      } else if (mustBeInteger && !Number.isInteger(val)) {
        errors.push([input, "Enter a whole number."]);
      }
    });

    ["gender", "country", "academic_level", "most_used_platform", "purpose_of_use"].forEach((key) => {
      const input = document.getElementById(key);
      if (!payload[key] || String(payload[key]).trim() === "") {
        errors.push([input, "This field is required."]);
      }
    });

    if (!payload.stress_level) {
      errors.push([stressHiddenInput, "Pick a stress level."]);
    }

    return errors;
  }

  // ---------------------------------------------------------
  // Gather form data into the exact StudentData shape
  // ---------------------------------------------------------
  function collectPayload() {
    const fd = new FormData(form);
    return {
      age: fd.get("age") === "" ? NaN : Number(fd.get("age")),
      gender: fd.get("gender") || "",
      country: (fd.get("country") || "").trim(),
      academic_level: fd.get("academic_level") || "",
      most_used_platform: fd.get("most_used_platform") || "",
      purpose_of_use: fd.get("purpose_of_use") || "",
      avg_daily_usage_hours: fd.get("avg_daily_usage_hours") === "" ? NaN : parseFloat(fd.get("avg_daily_usage_hours")),
      daily_unlocks: fd.get("daily_unlocks") === "" ? NaN : Number(fd.get("daily_unlocks")),
      study_hours: fd.get("study_hours") === "" ? NaN : parseFloat(fd.get("study_hours")),
      physical_activity_hours: fd.get("physical_activity_hours") === "" ? NaN : parseFloat(fd.get("physical_activity_hours")),
      sleep_hours_per_night: fd.get("sleep_hours_per_night") === "" ? NaN : parseFloat(fd.get("sleep_hours_per_night")),
      stress_level: fd.get("stress_level") || "",
    };
  }

  // ---------------------------------------------------------
  // UI state switching
  // ---------------------------------------------------------
  function showState(name) {
    [stateIdle, stateLoading, stateResult, stateError].forEach((el) => (el.hidden = true));
    ({ idle: stateIdle, loading: stateLoading, result: stateResult, error: stateError }[name]).hidden = false;
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.classList.toggle("loading", isSubmitting);
  }

  function renderResult(score) {
    const clamped = Math.max(0, Math.min(10, score));

    scoreNumberEl.textContent = score.toFixed(2);
    scoreBandEl.textContent = "Predicted score · informational only";
    scoreContextEl.textContent = "This dataset-derived score is not a clinical measure or diagnosis.";

    // reset then animate the arc fill on next frame
    gaugeFill.style.transition = "none";
    gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH);
    requestAnimationFrame(() => {
      gaugeFill.style.transition = "";
      const offset = GAUGE_ARC_LENGTH * (1 - clamped / 10);
      gaugeFill.style.strokeDashoffset = String(offset);
    });

    showState("result");
  }

  function addBarRow(container, label, value, maximum, suffix = "h") {
    const row = document.createElement("div");
    row.className = "bar-row";

    const name = document.createElement("span");
    name.className = "bar-name";
    name.textContent = label;

    const track = document.createElement("div");
    track.className = "bar-track";
    track.setAttribute("role", "img");
    track.setAttribute("aria-label", `${label}: ${value}${suffix}`);

    const fill = document.createElement("span");
    fill.className = "bar-fill";
    fill.style.width = `${Math.max(0, Math.min(100, (value / maximum) * 100))}%`;
    track.appendChild(fill);

    const amount = document.createElement("span");
    amount.className = "bar-value";
    amount.textContent = `${value}${suffix}`;

    row.append(name, track, amount);
    container.appendChild(row);
  }

  function renderLifestyle(payload) {
    lifestyleChart.replaceChildren();
    [
      ["Screen time", payload.avg_daily_usage_hours],
      ["Study", payload.study_hours],
      ["Movement", payload.physical_activity_hours],
      ["Sleep", payload.sleep_hours_per_night],
    ].forEach(([label, value]) => addBarRow(lifestyleChart, label, value, 24));

    reportedFacts.replaceChildren();
    const unlocks = document.createElement("span");
    unlocks.textContent = `${payload.daily_unlocks} phone unlocks / day`;
    const stress = document.createElement("span");
    stress.textContent = `Self-reported stress: ${payload.stress_level}`;
    reportedFacts.append(unlocks, stress);
  }

  function renderPredictionHistory(score) {
    predictionHistory.push(score);
    if (predictionHistory.length > 6) predictionHistory.shift();
    predictionChart.replaceChildren();
    predictionHistory.forEach((value, index) => {
      addBarRow(predictionChart, `Run ${index + 1}`, value, 10, "/10");
    });
  }

  function renderWellnessSuggestions(payload) {
    const suggestions = [];
    if (payload.sleep_hours_per_night < 7) {
      suggestions.push("You reported less than 7 hours of sleep. A steady sleep and wake time, with a calm wind-down, may support rest.");
    }
    if (payload.physical_activity_hours < 0.5) {
      suggestions.push("If it feels comfortable for you, consider adding a short walk or gentle stretch break to your day.");
    }
    if (payload.avg_daily_usage_hours > 6) {
      suggestions.push("For long screen sessions, regular eye and movement breaks can make time online more comfortable.");
    }
    if (["High", "Very High"].includes(payload.stress_level)) {
      suggestions.push("When stress feels high, a brief pause, slow breathing, or talking with someone supportive may help. Campus support is an option if stress persists.");
    }
    if (suggestions.length === 0) {
      suggestions.push("Keep noticing how your daily routines feel, and make small changes that suit your circumstances.");
    }
    wellnessSuggestions.replaceChildren(...suggestions.map((suggestion) => {
      const item = document.createElement("li");
      item.textContent = suggestion;
      return item;
    }));
  }

  function makeDailyPlan(payload, version) {
    const choice = (options) => options[version % options.length];
    const sleep = Number(payload.sleep_hours_per_night).toFixed(1);
    const activity = Number(payload.physical_activity_hours).toFixed(1);
    const screenTime = Number(payload.avg_daily_usage_hours).toFixed(1);
    const study = Number(payload.study_hours).toFixed(1);
    const highStress = ["High", "Very High"].includes(payload.stress_level);

    return [
      {
        period: "morning",
        icon: "↗",
        category: "Movement",
        title: choice([
          "Start with movement you enjoy",
          "Take a gentle movement break",
          "Step outside for a short walk",
        ]),
        action: choice([
          "Try a comfortable 10-minute walk, stretch, or yoga session; change the activity or duration to suit your day.",
          "Choose a short walk or a few easy stretches before settling into study.",
          "If it works for you, get some daylight with an easy walk and keep the pace comfortable.",
        ]),
        reason: `You reported ${activity} hours of physical activity per day. This is a flexible way to build movement around your current routine.`,
      },
      {
        period: "morning",
        icon: "♡",
        category: "Social connection",
        title: choice([
          "Make a small supportive connection",
          "Share a moment with someone you trust",
          "Send a low-pressure check-in",
        ]),
        action: choice([
          "Send a short message or plan a brief chat with someone supportive, whenever it fits.",
          "Have breakfast or a quick catch-up with a friend, family member, or classmate if you feel like it.",
          "Let someone you trust know how your day is starting; a short message is enough.",
        ]),
        reason: `You reported ${payload.stress_level.toLowerCase()} stress. Supportive contact is one optional way to feel connected during the day.`,
      },
      {
        period: "afternoon",
        icon: "◉",
        category: "Digital well-being",
        title: choice([
          "Create one screen-free pause",
          "Give your attention a short reset",
          "Take a break from notifications",
        ]),
        action: choice([
          "During one study block, place your phone out of reach and take a 5-minute screen-free break afterward.",
          "Pause between online tasks: look away from the screen, stretch, and check notifications at a chosen time.",
          "Mute non-essential notifications for one activity, then take a brief break away from your screen.",
        ]),
        reason: `You reported ${screenTime} hours of daily social-platform use and ${payload.daily_unlocks} phone unlocks. This plan adds a small, optional pause without judging your usage.`,
      },
      {
        period: "afternoon",
        icon: "▤",
        category: "Study-life balance",
        title: choice([
          "Give one study session a clear shape",
          "Build a pause into study time",
          "Choose a manageable next step",
        ]),
        action: choice([
          "Pick one priority for your next study block, then take a 5-minute stretch or water break before continuing.",
          "Break a task into a small first step and pause briefly between study sessions; adjust the pace to your workload.",
          "Set a realistic stopping point for one task and leave a short buffer before your next commitment.",
        ]),
        reason: `You entered ${study} study hours per day. A planned pause can help make that schedule feel more manageable.`,
      },
      {
        period: "evening",
        icon: "⌁",
        category: "Relaxation",
        title: highStress ? "Try a brief calming pause" : "Make space to unwind",
        action: highStress
          ? choice([
              "Try 3 minutes of slow, comfortable breathing or a quiet grounding exercise; stop if it feels uncomfortable.",
              "Take a 5-minute pause for gentle breathing, calming music, or simply sitting somewhere quiet.",
              "If helpful, follow a short guided meditation or do a few slow breaths before your evening routine.",
            ])
          : choice([
              "Take 5 minutes for a quiet activity you enjoy, such as music, gentle stretching, or slow breathing.",
              "Create a short transition from study to personal time with a walk, a warm drink, or a few easy breaths.",
              "Choose a low-pressure activity that helps you settle before the rest of your evening.",
            ]),
        reason: `You selected ${payload.stress_level} for perceived stress, so this offers a flexible way to pause at the end of the day.`,
      },
      {
        period: "evening",
        icon: "☾",
        category: "Sleep routine",
        title: choice([
          "Keep your sleep schedule steady",
          "Set up a gentle wind-down",
          "Make tomorrow's wake-up easier",
        ]),
        action: choice([
          "Choose a bedtime that fits your commitments and keep tomorrow's wake-up time close to your usual schedule.",
          "Set a 10-minute wind-down reminder: dim lights, put away study materials, and follow a routine you can repeat.",
          "Before bed, prepare one small thing for tomorrow and give yourself a calm, screen-light wind-down.",
        ]),
        reason: `You reported ${sleep} hours of sleep per night. This suggestion uses your own report to focus on a consistent, flexible schedule rather than prescribing a target.`,
      },
    ];
  }

  function updatePlanProgress() {
    const completed = document.querySelectorAll("#wellness-plan input[type='checkbox']:checked").length;
    const total = 6;
    planProgress.value = completed;
    planProgressCount.textContent = `${completed} of ${total} activities completed`;
    planProgressPercent.textContent = `${Math.round((completed / total) * 100)}%`;
  }

  function renderDailyPlan(payload) {
    currentPlanInputs = { ...payload };
    const activities = makeDailyPlan(payload, planVersion);
    const planNumber = planVersion + 1;
    planVersion += 1;

    Object.values(planLists).forEach((list) => list.replaceChildren());
    activities.forEach((activity, index) => {
      const item = document.createElement("li");
      const label = document.createElement("label");
      label.className = "plan-activity-card";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.setAttribute("aria-label", `Mark ${activity.category} activity complete`);
      checkbox.addEventListener("change", updatePlanProgress);

      const icon = document.createElement("span");
      icon.className = "plan-activity-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = activity.icon;

      const content = document.createElement("span");
      content.className = "plan-activity-content";
      const category = document.createElement("span");
      category.className = "plan-category";
      category.textContent = activity.category;
      const title = document.createElement("strong");
      title.className = "plan-activity-title";
      title.textContent = activity.title;
      const action = document.createElement("span");
      action.className = "plan-activity-action";
      action.textContent = activity.action;
      const reason = document.createElement("span");
      reason.className = "plan-activity-reason";
      reason.textContent = activity.reason;

      content.append(category, title, action, reason);
      label.append(checkbox, icon, content);
      item.appendChild(label);
      planLists[activity.period].appendChild(item);
    });

    wellnessPlan.dataset.planNumber = String(planNumber);
    wellnessPlan.hidden = false;
    updatePlanProgress();
  }

  refreshPlanBtn.addEventListener("click", () => {
    if (currentPlanInputs) renderDailyPlan(currentPlanInputs);
  });

  async function loadModelComparison() {
    try {
      const response = await fetch(`${API_BASE}/model-comparison`);
      if (!response.ok) throw new Error("Metrics unavailable");
      const { models } = await response.json();
      modelComparisonBody.replaceChildren();
      if (!models.length) {
        modelComparisonBody.innerHTML = '<tr><td colspan="4">Run train_model.py to create metrics.</td></tr>';
        return;
      }
      models.forEach((model, index) => {
        const row = document.createElement("tr");
        if (index === 0) row.className = "selected-model";
        [model.Model, Number(model.MAE).toFixed(3), Number(model.RMSE).toFixed(3), Number(model.R2).toFixed(3)].forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.appendChild(cell);
        });
        modelComparisonBody.appendChild(row);
      });
    } catch {
      modelComparisonBody.innerHTML = '<tr><td colspan="4">Start the API and reload to view model metrics.</td></tr>';
    }
  }

  loadModelComparison();

  function renderError(label, copy) {
    errorLabelEl.textContent = label;
    errorCopyEl.textContent = copy;
    showState("error");
  }

  // ---------------------------------------------------------
  // Parse FastAPI / Pydantic 422 error responses into
  // field-level messages where possible
  // ---------------------------------------------------------
  function applyServerValidationErrors(detail) {
    if (!Array.isArray(detail)) return false;
    let matched = false;
    detail.forEach((err) => {
      const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : null;
      const input = field ? document.getElementById(field) : null;
      const target = field === "stress_level" ? stressHiddenInput : input;
      if (target) {
        setFieldError(target, err.msg || "Invalid value.");
        matched = true;
      }
    });
    return matched;
  }

  // ---------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllErrors();
    wellnessPlan.hidden = true;

    const payload = collectPayload();
    const clientErrors = validate(payload);

    if (clientErrors.length > 0) {
      clientErrors.forEach(([input, msg]) => input && setFieldError(input, msg));
      clientErrors[0][0]?.focus?.();
      return;
    }

    setSubmitting(true);
    showState("loading");

    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 422) {
        const body = await res.json().catch(() => null);
        const matched = body && applyServerValidationErrors(body.detail);
        renderError(
          "Check your inputs",
          matched
            ? "The API rejected a few fields — details are marked on the form."
            : "The API rejected this submission. Please review your inputs and try again."
        );
        return;
      }

      if (!res.ok) {
        let detailMsg = `The API responded with status ${res.status}.`;
        const body = await res.json().catch(() => null);
        if (body && typeof body.detail === "string") detailMsg = body.detail;
        renderError("Prediction failed", detailMsg);
        return;
      }

      const data = await res.json();
      if (typeof data.predicted_mental_health_score !== "number") {
        renderError("Unexpected response", "The API responded, but the score was missing or malformed.");
        return;
      }

      renderResult(data.predicted_mental_health_score);
      renderLifestyle(payload);
      renderPredictionHistory(data.predicted_mental_health_score);
      renderWellnessSuggestions(payload);
      renderDailyPlan(payload);
    } catch (err) {
      renderError(
        "Can't reach the server",
        `Couldn't connect to ${API_BASE}. Start the backend with "uvicorn main:app --host 127.0.0.1 --port 2200 --reload" and reload this page.`
      );
    } finally {
      setSubmitting(false);
    }
  });

  // live-clear errors as the user edits
  form.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input", () => clearFieldError(el));
    el.addEventListener("change", () => clearFieldError(el));
  });

  resetBtn.addEventListener("click", () => {
    wellnessPlan.hidden = true;
    showState("idle");
  });

  errorRetryBtn.addEventListener("click", () => {
    wellnessPlan.hidden = true;
    showState("idle");
  });
})();
