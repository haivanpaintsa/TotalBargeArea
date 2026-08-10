"use strict";

// Các hằng số nghiệp vụ được tập trung tại một nơi để dễ kiểm tra và bảo trì.
const DEFAULT_K = 0.85;
const DEFAULT_COAMING_FACTOR = 1.3;
const DEFAULT_DECK_BARGE_RIB_FACTOR = 2.5;
const DEFAULT_UNDER_700_RIB_FACTOR = 2.5;
const DEFAULT_OVER_700_RIB_FACTOR = 4.5;
const UNDER_700_WALKWAY_WIDTH = 0.9;
const OVER_700_WALKWAY_WIDTH = 2.8;

const AREA_FORMATTER = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
});

const BARGE_TYPES = {
  deck: {
    name: "Sà lan boong",
    ribFactor: DEFAULT_DECK_BARGE_RIB_FACTOR,
    resultRows: [
      ["bottomAndBilge", "Đáy và mo"],
      ["drySide", "Mạn khô"],
      ["deck", "Mặt boong"],
      ["inside", "Bên trong"],
    ],
  },
  under700: {
    name: "Sà lan tự hành ≤ 700 tấn",
    ribFactor: DEFAULT_UNDER_700_RIB_FACTOR,
    walkwayWidth: UNDER_700_WALKWAY_WIDTH,
    resultRows: [
      ["bottomAndBilge", "Đáy và mo"],
      ["drySide", "Mạn khô"],
      ["walkway", "Lối đi mặt boong"],
      ["coaming", "Quầy hầm"],
      ["cargoHold", "Hầm hàng"],
      ["inside", "Bên trong"],
    ],
  },
  over700: {
    name: "Sà lan tự hành > 700 tấn",
    ribFactor: DEFAULT_OVER_700_RIB_FACTOR,
    walkwayWidth: OVER_700_WALKWAY_WIDTH,
    resultRows: [
      ["bottomAndBilge", "Đáy và mo"],
      ["drySide", "Mạn khô"],
      ["walkway", "Lối đi mặt boong"],
      ["coaming", "Quầy hầm"],
      ["cargoHold", "Hầm hàng"],
      ["inside", "Bên trong"],
    ],
  },
};

const SAMPLE_DATA = {
  deck: {
    length: "10",
    width: "5",
    height: "2",
    ribFactor: "2.5",
    hasCoaming: false,
    hasCargoHold: false,
  },
  under700: {
    length: "45",
    width: "8",
    height: "3.4",
    coefficientK: "0.85",
    ribFactor: "2.5",
    hasCoaming: false,
    hasCargoHold: false,
  },
  over700: {
    length: "79.9",
    width: "13.14",
    height: "4.6",
    coefficientK: "0.85",
    ribFactor: "4.5",
    hasCoaming: true,
    coamingLength: "62",
    coamingWidth: "10.5",
    coamingHeight: "1.5",
    coamingFactor: "1.3",
    hasCargoHold: true,
    cargoLength: "62",
    cargoWidth: "10.5",
    cargoHeight: "6.3",
    partitionCount: "0",
  },
};

const form = document.getElementById("calculator-panel");
const typeTabs = Array.from(document.querySelectorAll("[data-barge-type]"));
const selfPropelledElements = Array.from(
  document.querySelectorAll(".self-propelled-section, .self-propelled-only"),
);
const hasCoamingInput = document.getElementById("has-coaming");
const hasCargoHoldInput = document.getElementById("has-cargo-hold");
const coamingFields = document.getElementById("coaming-fields");
const cargoFields = document.getElementById("cargo-fields");
const resultsBody = document.getElementById("results-body");
const resultStatus = document.getElementById("result-status");
const formulaContent = document.getElementById("formula-content");
const copyButton = document.getElementById("copy-button");
const printButton = document.getElementById("print-button");
const toast = document.getElementById("toast");

let selectedBargeType = "deck";
let lastCalculation = null;
let toastTimer = null;

/** Chuẩn hóa số thập phân nhập bằng dấu chấm hoặc dấu phẩy. */
function parseVietnameseNumber(value) {
  if (typeof value !== "string") {
    return Number(value);
  }

  const normalizedValue = value.trim().replace(/\s+/g, "").replace(",", ".");

  return Number.parseFloat(normalizedValue);
}

function isStrictNumericText(value) {
  const normalized = String(value).trim().replace(/\s+/g, "");
  return /^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(normalized);
}

function formatArea(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return AREA_FORMATTER.format(value);
}

function getInput(id) {
  return document.getElementById(id);
}

function setFieldError(input, message) {
  const field = input.closest(".field");
  const error = document.getElementById(`${input.id}-error`);
  input.setAttribute("aria-invalid", "true");
  field.classList.add("has-error");
  if (error) {
    error.textContent = message;
  }
}

function clearFieldError(input) {
  const field = input.closest(".field");
  const error = document.getElementById(`${input.id}-error`);
  input.removeAttribute("aria-invalid");
  if (field) {
    field.classList.remove("has-error");
  }
  if (error) {
    error.textContent = "";
  }
}

function clearAllErrors() {
  form.querySelectorAll("input").forEach(clearFieldError);
}

function validatePositiveField(id, label, showErrors) {
  const input = getInput(id);
  const rawValue = input.value.trim();

  if (rawValue === "") {
    if (showErrors) {
      setFieldError(input, `Vui lòng nhập ${label.toLowerCase()}.`);
    }
    return { valid: false, input, value: null };
  }

  if (!isStrictNumericText(rawValue)) {
    if (showErrors) {
      setFieldError(input, "Giá trị phải là một số hợp lệ.");
    }
    return { valid: false, input, value: null };
  }

  const value = parseVietnameseNumber(rawValue);
  if (!Number.isFinite(value)) {
    if (showErrors) {
      setFieldError(input, "Giá trị không hợp lệ hoặc vượt quá giới hạn.");
    }
    return { valid: false, input, value: null };
  }

  if (value <= 0) {
    if (showErrors) {
      setFieldError(input, `${label} phải lớn hơn 0.`);
    }
    return { valid: false, input, value: null };
  }

  if (showErrors) {
    clearFieldError(input);
  }
  return { valid: true, input, value };
}

function validateNonNegativeIntegerField(id, label, showErrors) {
  const input = getInput(id);
  const rawValue = input.value.trim();
  const isIntegerText = /^\d+$/.test(rawValue);
  const value = Number(rawValue);

  if (rawValue === "") {
    if (showErrors) {
      setFieldError(input, `Vui lòng nhập ${label.toLowerCase()}.`);
    }
    return { valid: false, input, value: null };
  }

  if (!isIntegerText || !Number.isSafeInteger(value) || value < 0) {
    if (showErrors) {
      setFieldError(input, `${label} phải là số nguyên lớn hơn hoặc bằng 0.`);
    }
    return { valid: false, input, value: null };
  }

  if (showErrors) {
    clearFieldError(input);
  }
  return { valid: true, input, value };
}

function validateOuterHull(showErrors = true) {
  const checks = [
    ["length", "Chiều dài D"],
    ["width", "Chiều rộng R"],
    ["height", "Chiều cao C"],
  ];

  if (selectedBargeType !== "deck") {
    checks.push(["coefficient-k", "Hệ số hiệu chỉnh k"]);
  }
  checks.push(["rib-factor", "Hệ số xương vỏ ngoài"]);

  const values = {};
  const invalidInputs = [];

  checks.forEach(([id, label]) => {
    const check = validatePositiveField(id, label, showErrors);
    if (check.valid) {
      values[getInput(id).name] = check.value;
    } else {
      invalidInputs.push(check.input);
    }
  });

  return { valid: invalidInputs.length === 0, values, invalidInputs };
}

function validateCoaming(showErrors = true) {
  if (selectedBargeType === "deck" || !hasCoamingInput.checked) {
    return { valid: true, values: { hasCoaming: false }, invalidInputs: [] };
  }

  const checks = [
    ["coaming-length", "Chiều dài quầy hầm"],
    ["coaming-width", "Chiều rộng quầy hầm"],
    ["coaming-height", "Chiều cao quầy hầm"],
    ["coaming-factor", "Hệ số xương quầy hầm"],
  ];
  const values = { hasCoaming: true };
  const invalidInputs = [];

  checks.forEach(([id, label]) => {
    const check = validatePositiveField(id, label, showErrors);
    if (check.valid) {
      values[getInput(id).name] = check.value;
    } else {
      invalidInputs.push(check.input);
    }
  });

  return { valid: invalidInputs.length === 0, values, invalidInputs };
}

function validateCargoHold(showErrors = true) {
  if (selectedBargeType === "deck" || !hasCargoHoldInput.checked) {
    return { valid: true, values: { hasCargoHold: false }, invalidInputs: [] };
  }

  const checks = [
    ["cargo-length", "Chiều dài hầm hàng"],
    ["cargo-width", "Chiều rộng hầm hàng"],
    ["cargo-height", "Chiều cao hầm hàng"],
  ];
  const values = { hasCargoHold: true };
  const invalidInputs = [];

  checks.forEach(([id, label]) => {
    const check = validatePositiveField(id, label, showErrors);
    if (check.valid) {
      values[getInput(id).name] = check.value;
    } else {
      invalidInputs.push(check.input);
    }
  });

  const partitionCheck = validateNonNegativeIntegerField(
    "partition-count",
    "Số vách ngăn",
    showErrors,
  );
  if (partitionCheck.valid) {
    values.partitionCount = partitionCheck.value;
  } else {
    invalidInputs.push(partitionCheck.input);
  }

  return { valid: invalidInputs.length === 0, values, invalidInputs };
}

function collectValidatedInput(showErrors = true) {
  if (showErrors) {
    clearAllErrors();
  }

  const outerHull = validateOuterHull(showErrors);
  const coaming = validateCoaming(showErrors);
  const cargoHold = validateCargoHold(showErrors);
  const invalidInputs = [
    ...outerHull.invalidInputs,
    ...coaming.invalidInputs,
    ...cargoHold.invalidInputs,
  ];

  return {
    valid: invalidInputs.length === 0,
    invalidInputs,
    values: {
      ...outerHull.values,
      ...coaming.values,
      ...cargoHold.values,
    },
  };
}

function calculateDeckBarge(input) {
  const draft = input.height / 5;
  const freeboard = (4 * input.height) / 5;
  const bottomAndBilge = input.length * input.width * draft;
  const drySide = (input.length + input.width) * freeboard * 2;
  const deck = input.length * input.width;
  const inside = (bottomAndBilge + drySide + deck) * input.ribFactor;
  const total = bottomAndBilge + drySide + deck + inside;

  return { draft, freeboard, bottomAndBilge, drySide, deck, inside, total };
}

function calculateSelfPropelled(input, walkwayWidth) {
  const draft = input.height / 4;
  const freeboard = (3 * input.height) / 4;
  const bottomAndBilge =
    input.length * input.width * draft * input.coefficientK;
  const drySide = (input.length + input.width) * freeboard * 2;
  const walkway = input.length * walkwayWidth * 2;
  const coaming = input.hasCoaming
    ? (input.coamingLength * input.coamingHeight +
        input.coamingWidth * input.coamingHeight) *
      input.coamingFactor *
      2
    : 0;
  const cargoHold = input.hasCargoHold
    ? input.cargoLength * input.cargoHeight * 2 +
      input.cargoWidth * input.cargoHeight * 2 +
      input.cargoWidth * input.cargoHeight * 2 * input.partitionCount +
      input.cargoLength * input.cargoWidth
    : 0;
  const inside =
    (bottomAndBilge + drySide + input.length * input.width) * input.ribFactor;
  const total =
    bottomAndBilge + drySide + walkway + coaming + cargoHold + inside;

  return {
    draft,
    freeboard,
    bottomAndBilge,
    drySide,
    walkway,
    coaming,
    cargoHold,
    inside,
    total,
  };
}

function calculateSelfPropelledUnder700(input) {
  return calculateSelfPropelled(input, UNDER_700_WALKWAY_WIDTH);
}

function calculateSelfPropelledOver700(input) {
  return calculateSelfPropelled(input, OVER_700_WALKWAY_WIDTH);
}

function calculateForSelectedType(input) {
  if (selectedBargeType === "deck") {
    return calculateDeckBarge(input);
  }
  if (selectedBargeType === "under700") {
    return calculateSelfPropelledUnder700(input);
  }
  return calculateSelfPropelledOver700(input);
}

function createResultRow(label, value, isTotal = false) {
  const row = document.createElement("tr");
  const areaCell = document.createElement("td");
  const valueCell = document.createElement("td");
  const unitCell = document.createElement("td");

  areaCell.textContent = label;
  valueCell.textContent = formatArea(value);
  unitCell.textContent = "m²";

  row.append(areaCell, valueCell, unitCell);
  if (isTotal) {
    row.classList.add("total-row");
  }
  return row;
}

function renderResults(result = null) {
  const config = BARGE_TYPES[selectedBargeType];
  resultsBody.replaceChildren();

  config.resultRows.forEach(([key, label]) => {
    resultsBody.appendChild(
      createResultRow(label, result ? result[key] : null),
    );
  });
  resultsBody.appendChild(
    createResultRow("Tổng diện tích", result ? result.total : null, true),
  );

  const hasResult =
    Boolean(result) && Object.values(result).every(Number.isFinite);
  resultStatus.textContent = hasResult
    ? "Đã tính theo thông số hiện tại."
    : "Nhập đủ thông số để xem kết quả.";
  resultStatus.classList.toggle("is-ready", hasResult);
  copyButton.disabled = !hasResult;
  printButton.disabled = !hasResult;
}

function createFormulaBlock(title, lines) {
  const block = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = title;
  block.className = "formula-block";
  block.appendChild(heading);

  lines.forEach((line) => {
    const paragraph = document.createElement("p");
    paragraph.className = "formula-line";
    paragraph.textContent = line;
    block.appendChild(paragraph);
  });
  return block;
}

function renderFormulaDetails(input = null, result = null) {
  formulaContent.replaceChildren();

  const variableText = document.createElement("p");
  variableText.textContent =
    "Biến sử dụng: D = chiều dài; R = chiều rộng; C = chiều cao; T₀ = mớn quy ước; H = chiều cao mạn khô; k = hệ số hiệu chỉnh.";
  formulaContent.appendChild(variableText);

  if (!input || !result) {
    const emptyText = document.createElement("p");
    emptyText.textContent =
      "Nhập đủ dữ liệu để hiển thị phép thế số cho từng khu vực.";
    formulaContent.appendChild(emptyText);
    return;
  }

  const f = formatArea;
  const commonBlocks = [
    createFormulaBlock("Giá trị tự động", [
      selectedBargeType === "deck" ? "T₀ = C / 5" : "T₀ = C / 4",
      `T₀ = ${f(result.draft)} m`,
      selectedBargeType === "deck" ? "H = 4 × C / 5" : "H = 3 × C / 4",
      `H = ${f(result.freeboard)} m`,
    ]),
  ];

  if (selectedBargeType === "deck") {
    commonBlocks.push(
      createFormulaBlock("Đáy và mo", [
        "S đáy và mo = D × R × T₀",
        `S đáy và mo = ${f(input.length)} × ${f(input.width)} × ${f(result.draft)}`,
        `S đáy và mo = ${f(result.bottomAndBilge)} m²`,
      ]),
      createFormulaBlock("Mạn khô", [
        "S mạn khô = (D + R) × H × 2",
        `S mạn khô = (${f(input.length)} + ${f(input.width)}) × ${f(result.freeboard)} × 2`,
        `S mạn khô = ${f(result.drySide)} m²`,
      ]),
      createFormulaBlock("Mặt boong", [
        "S mặt boong = D × R",
        `S mặt boong = ${f(input.length)} × ${f(input.width)}`,
        `S mặt boong = ${f(result.deck)} m²`,
      ]),
      createFormulaBlock("Bên trong", [
        "S bên trong = (S đáy và mo + S mạn khô + S mặt boong) × hệ số xương",
        `S bên trong = (${f(result.bottomAndBilge)} + ${f(result.drySide)} + ${f(result.deck)}) × ${f(input.ribFactor)}`,
        `S bên trong = ${f(result.inside)} m²`,
      ]),
    );
  } else {
    const walkwayWidth = BARGE_TYPES[selectedBargeType].walkwayWidth;
    commonBlocks.push(
      createFormulaBlock("Đáy và mo", [
        "S đáy và mo = D × R × T₀ × k",
        `S đáy và mo = ${f(input.length)} × ${f(input.width)} × ${f(result.draft)} × ${f(input.coefficientK)}`,
        `S đáy và mo = ${f(result.bottomAndBilge)} m²`,
      ]),
      createFormulaBlock("Mạn khô", [
        "S mạn khô = (D + R) × H × 2",
        `S mạn khô = (${f(input.length)} + ${f(input.width)}) × ${f(result.freeboard)} × 2`,
        `S mạn khô = ${f(result.drySide)} m²`,
      ]),
      createFormulaBlock("Lối đi mặt boong", [
        "S lối đi mặt boong = D × chiều rộng lối đi × 2",
        `S lối đi mặt boong = ${f(input.length)} × ${f(walkwayWidth)} × 2`,
        `S lối đi mặt boong = ${f(result.walkway)} m²`,
      ]),
      createFormulaBlock(
        "Quầy hầm",
        input.hasCoaming
          ? [
              "S quầy hầm = (Dqh × Cqh + Rqh × Cqh) × hệ số xương quầy hầm × 2",
              `S quầy hầm = (${f(input.coamingLength)} × ${f(input.coamingHeight)} + ${f(input.coamingWidth)} × ${f(input.coamingHeight)}) × ${f(input.coamingFactor)} × 2`,
              `S quầy hầm = ${f(result.coaming)} m²`,
            ]
          : ["Không có quầy hầm.", "S quầy hầm = 0 m²"],
      ),
      createFormulaBlock(
        "Hầm hàng",
        input.hasCargoHold
          ? [
              "S hầm hàng = Dhh × Chh × 2 + Rhh × Chh × 2 + Rhh × Chh × 2 × số vách ngăn + Dhh × Rhh",
              `S hầm hàng = ${f(input.cargoLength)} × ${f(input.cargoHeight)} × 2 + ${f(input.cargoWidth)} × ${f(input.cargoHeight)} × 2 + ${f(input.cargoWidth)} × ${f(input.cargoHeight)} × 2 × ${input.partitionCount} + ${f(input.cargoLength)} × ${f(input.cargoWidth)}`,
              `S hầm hàng = ${f(result.cargoHold)} m²`,
            ]
          : ["Không có hầm hàng.", "S hầm hàng = 0 m²"],
      ),
      createFormulaBlock("Bên trong", [
        "S bên trong = (S đáy và mo + S mạn khô + D × R) × hệ số xương",
        `S bên trong = (${f(result.bottomAndBilge)} + ${f(result.drySide)} + ${f(input.length)} × ${f(input.width)}) × ${f(input.ribFactor)}`,
        `S bên trong = ${f(result.inside)} m²`,
      ]),
    );
  }

  commonBlocks.push(
    createFormulaBlock("Tổng diện tích", [
      selectedBargeType === "deck"
        ? "Tổng = S đáy và mo + S mạn khô + S mặt boong + S bên trong"
        : "Tổng = S đáy và mo + S mạn khô + S lối đi mặt boong + S quầy hầm + S hầm hàng + S bên trong",
      `Tổng diện tích = ${f(result.total)} m²`,
    ]),
  );

  formulaContent.append(...commonBlocks);
}

function getInputSummary(input) {
  const entries = [
    ["Chiều dài D", input.length, "m"],
    ["Chiều rộng R", input.width, "m"],
    ["Chiều cao C", input.height, "m"],
    [
      "Mớn quy ước T₀",
      selectedBargeType === "deck" ? input.height / 5 : input.height / 4,
      "m",
    ],
    [
      "Chiều cao mạn khô H",
      selectedBargeType === "deck"
        ? (4 * input.height) / 5
        : (3 * input.height) / 4,
      "m",
    ],
  ];

  if (selectedBargeType !== "deck") {
    entries.push(["Hệ số hiệu chỉnh k", input.coefficientK, ""]);
  }
  entries.push(["Hệ số xương vỏ ngoài", input.ribFactor, ""]);

  if (selectedBargeType !== "deck") {
    if (input.hasCoaming) {
      entries.push(
        ["Chiều dài quầy hầm", input.coamingLength, "m"],
        ["Chiều rộng quầy hầm", input.coamingWidth, "m"],
        ["Chiều cao quầy hầm", input.coamingHeight, "m"],
        ["Hệ số xương quầy hầm", input.coamingFactor, ""],
      );
    } else {
      entries.push(["Quầy hầm", "Không có", ""]);
    }

    if (input.hasCargoHold) {
      entries.push(
        ["Chiều dài hầm hàng", input.cargoLength, "m"],
        ["Chiều rộng hầm hàng", input.cargoWidth, "m"],
        ["Chiều cao hầm hàng", input.cargoHeight, "m"],
        ["Số vách ngăn", input.partitionCount, ""],
      );
    } else {
      entries.push(["Hầm hàng", "Không có", ""]);
    }
  }

  return entries;
}

function updatePrintMeta(input, calculatedAt) {
  document.getElementById("print-barge-type").textContent =
    BARGE_TYPES[selectedBargeType].name;
  document.getElementById("print-calculated-at").textContent =
    DATE_TIME_FORMATTER.format(calculatedAt);
  const list = document.getElementById("print-input-list");
  list.replaceChildren();

  getInputSummary(input).forEach(([label, value, unit]) => {
    const item = document.createElement("li");
    const formattedValue =
      typeof value === "number" ? formatArea(value) : value;
    item.textContent = `${label}: ${formattedValue}${unit ? ` ${unit}` : ""}`;
    list.appendChild(item);
  });
}

function performCalculation({
  showErrors = true,
  focusFirstError = false,
  scrollToResults = false,
} = {}) {
  const validation = collectValidatedInput(showErrors);

  if (!validation.valid) {
    lastCalculation = null;
    renderResults();
    renderFormulaDetails();
    if (focusFirstError && validation.invalidInputs[0]) {
      validation.invalidInputs[0].focus();
    }
    return false;
  }

  const result = calculateForSelectedType(validation.values);
  if (!Object.values(result).every(Number.isFinite)) {
    lastCalculation = null;
    renderResults();
    resultStatus.textContent =
      "Không thể tính với dữ liệu hiện tại. Vui lòng kiểm tra lại.";
    return false;
  }

  const calculatedAt = new Date();
  lastCalculation = {
    type: selectedBargeType,
    input: validation.values,
    result,
    calculatedAt,
  };

  updateAutomaticFields(result.draft, result.freeboard);
  renderResults(result);
  renderFormulaDetails(validation.values, result);
  updatePrintMeta(validation.values, calculatedAt);

  if (scrollToResults && window.matchMedia("(max-width: 640px)").matches) {
    document
      .getElementById("results-section")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return true;
}

function updateAutomaticFields(draftValue, freeboardValue) {
  getInput("draft").value = Number.isFinite(draftValue)
    ? formatArea(draftValue)
    : "";
  getInput("freeboard").value = Number.isFinite(freeboardValue)
    ? formatArea(freeboardValue)
    : "";
}

function updateAutomaticFieldsFromHeight() {
  const heightInput = getInput("height");
  const height = parseVietnameseNumber(heightInput.value);
  const isValid =
    isStrictNumericText(heightInput.value) &&
    Number.isFinite(height) &&
    height > 0;

  if (!isValid) {
    updateAutomaticFields(null, null);
    return;
  }

  if (selectedBargeType === "deck") {
    updateAutomaticFields(height / 5, (4 * height) / 5);
  } else {
    updateAutomaticFields(height / 4, (3 * height) / 4);
  }
}

function setOptionalFieldsState(checkbox, container) {
  const isVisible = checkbox.checked;
  container.hidden = !isVisible;
  container.querySelectorAll("input").forEach((input) => {
    input.disabled = !isVisible;
    if (!isVisible) {
      clearFieldError(input);
    }
  });
}

function updateBargeTypeUI() {
  const isSelfPropelled = selectedBargeType !== "deck";
  const activeTab = typeTabs.find(
    (tab) => tab.dataset.bargeType === selectedBargeType,
  );

  typeTabs.forEach((tab) => {
    const isActive = tab === activeTab;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.setAttribute("tabindex", isActive ? "0" : "-1");
  });

  form.setAttribute("aria-labelledby", activeTab.id);
  selfPropelledElements.forEach((element) => {
    element.hidden = !isSelfPropelled;
  });
  getInput("coefficient-k").disabled = !isSelfPropelled;

  if (!isSelfPropelled) {
    hasCoamingInput.checked = false;
    hasCargoHoldInput.checked = false;
  }
  setOptionalFieldsState(hasCoamingInput, coamingFields);
  setOptionalFieldsState(hasCargoHoldInput, cargoFields);

  const ruleText =
    selectedBargeType === "deck"
      ? "T₀ = C / 5 · H = 4 × C / 5"
      : `T₀ = C / 4 · H = 3 × C / 4 · Lối đi ${formatArea(BARGE_TYPES[selectedBargeType].walkwayWidth)} m`;
  document.getElementById("outer-hull-note").textContent = ruleText;
  document.getElementById("print-barge-type").textContent =
    BARGE_TYPES[selectedBargeType].name;
}

function resetForm() {
  form.reset();
  getInput("coefficient-k").value = String(DEFAULT_K);
  getInput("coaming-factor").value = String(DEFAULT_COAMING_FACTOR);
  getInput("partition-count").value = "0";
  getInput("rib-factor").value = String(
    BARGE_TYPES[selectedBargeType].ribFactor,
  );
  clearAllErrors();
  updateBargeTypeUI();
  updateAutomaticFields(null, null);
  lastCalculation = null;
  renderResults();
  renderFormulaDetails();
  document.getElementById("print-calculated-at").textContent = "—";
  document.getElementById("print-input-list").replaceChildren();
}

function loadSampleData() {
  resetForm();
  const sample = SAMPLE_DATA[selectedBargeType];

  Object.entries(sample).forEach(([name, value]) => {
    const input = form.elements.namedItem(name);
    if (!input) {
      return;
    }
    if (input.type === "checkbox") {
      input.checked = value;
    } else {
      input.value = value;
    }
  });

  setOptionalFieldsState(hasCoamingInput, coamingFields);
  setOptionalFieldsState(hasCargoHoldInput, cargoFields);
  updateAutomaticFieldsFromHeight();
  performCalculation({ showErrors: true });
  showToast(`Đã nạp dữ liệu mẫu: ${BARGE_TYPES[selectedBargeType].name}.`);
}

function buildCopyText() {
  if (!lastCalculation) {
    return "";
  }

  const { input, result, calculatedAt } = lastCalculation;
  const lines = [
    "CÔNG CỤ TÍNH DIỆN TÍCH SƠN SÀ LAN",
    `Loại sà lan: ${BARGE_TYPES[selectedBargeType].name}`,
    `Ngày giờ tính toán: ${DATE_TIME_FORMATTER.format(calculatedAt)}`,
    "",
    "THÔNG SỐ ĐẦU VÀO",
  ];

  getInputSummary(input).forEach(([label, value, unit]) => {
    const formattedValue =
      typeof value === "number" ? formatArea(value) : value;
    lines.push(`${label}: ${formattedValue}${unit ? ` ${unit}` : ""}`);
  });

  lines.push("", "KẾT QUẢ DIỆN TÍCH");
  BARGE_TYPES[selectedBargeType].resultRows.forEach(([key, label]) => {
    lines.push(`${label}: ${formatArea(result[key])} m²`);
  });
  lines.push(`Tổng diện tích: ${formatArea(result.total)} m²`);
  lines.push(
    "",
    "Lưu ý: Kết quả mang tính chất ước tính; cần kiểm tra thông số thực tế trước khi sử dụng.",
  );
  return lines.join("\n");
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.className = "clipboard-helper";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

async function copyResults() {
  const text = buildCopyText();
  if (!text) {
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else if (!fallbackCopyText(text)) {
      throw new Error("Fallback copy failed");
    }
    showToast("Đã sao chép kết quả.");
  } catch (error) {
    try {
      if (!fallbackCopyText(text)) {
        throw error;
      }
      showToast("Đã sao chép kết quả.");
    } catch (fallbackError) {
      showToast("Không thể sao chép tự động. Vui lòng thử lại.");
    }
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}

function handleBargeTypeChange(type) {
  if (!BARGE_TYPES[type] || type === selectedBargeType) {
    return;
  }
  selectedBargeType = type;
  updateBargeTypeUI();
  resetForm();
}

// Sự kiện giao diện và cập nhật tính toán theo dữ liệu hợp lệ.
form.addEventListener("submit", (event) => {
  event.preventDefault();
  performCalculation({
    showErrors: true,
    focusFirstError: true,
    scrollToResults: true,
  });
});

form.addEventListener("input", (event) => {
  if (event.target.matches("input[type='text']")) {
    clearFieldError(event.target);
  }
  if (event.target.id === "height") {
    updateAutomaticFieldsFromHeight();
  }
  performCalculation({ showErrors: false });
});

hasCoamingInput.addEventListener("change", () => {
  setOptionalFieldsState(hasCoamingInput, coamingFields);
  performCalculation({ showErrors: false });
});

hasCargoHoldInput.addEventListener("change", () => {
  setOptionalFieldsState(hasCargoHoldInput, cargoFields);
  performCalculation({ showErrors: false });
});

typeTabs.forEach((tab, index) => {
  tab.addEventListener("click", () =>
    handleBargeTypeChange(tab.dataset.bargeType),
  );
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % typeTabs.length;
    if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + typeTabs.length) % typeTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = typeTabs.length - 1;
    typeTabs[nextIndex].focus();
    handleBargeTypeChange(typeTabs[nextIndex].dataset.bargeType);
  });
});

document
  .getElementById("load-sample-button")
  .addEventListener("click", loadSampleData);
document.getElementById("reset-button").addEventListener("click", resetForm);
copyButton.addEventListener("click", copyResults);
printButton.addEventListener("click", () => {
  if (performCalculation({ showErrors: true, focusFirstError: true })) {
    window.print();
  }
});

// Khởi tạo trạng thái mặc định khi mở trực tiếp index.html.
updateBargeTypeUI();
resetForm();
