/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const toggleRtlBtn = document.getElementById("toggleRtl");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectionsBtn = document.getElementById("clearSelections");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

const WORKER_URL = "https://loreal-chat-worker.cjazwin.workers.dev/";
const SELECTED_STORAGE_KEY = "selectedProductIds";
const DIRECTION_STORAGE_KEY = "appDirection";
const MAX_SELECTED_PRODUCTS = 6;
const MAX_HISTORY_TURNS = 10;
const REQUEST_ERROR_MESSAGE =
  "Sorry, I couldn't generate your routine right now. Please try again in a moment.";

const TOPIC_GUIDANCE =
  "Only answer questions about the generated routine and related topics like skincare, haircare, makeup, fragrance, beauty routines, and product-use questions. Politely decline unrelated topics.";

let allProducts = [];
const selectedProductIds = new Set();
const expandedProductIds = new Set();
let conversationHistory = [];
let routineContext = "";
let isLoading = false;
let currentSearchKeyword = "";

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

function getProductById(productId) {
  return allProducts.find((product) => product.id === productId);
}

function getDescriptionId(productId) {
  return `product-description-${productId}`;
}

function saveSelectedProducts() {
  localStorage.setItem(
    SELECTED_STORAGE_KEY,
    JSON.stringify([...selectedProductIds]),
  );
}

function restoreSelectedProducts() {
  const rawValue = localStorage.getItem(SELECTED_STORAGE_KEY);

  if (!rawValue) {
    return;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return;
    }

    parsed.forEach((value) => {
      const productId = Number(value);
      const productExists = allProducts.some(
        (product) => product.id === productId,
      );

      if (productExists) {
        selectedProductIds.add(productId);
      }
    });
  } catch {
    localStorage.removeItem(SELECTED_STORAGE_KEY);
  }
}

function updateButtonStates() {
  generateRoutineBtn.disabled = selectedProductIds.size === 0 || isLoading;
  sendBtn.disabled = isLoading;
  clearSelectionsBtn.disabled = selectedProductIds.size === 0 || isLoading;
}

function appendChatMessage(role, text) {
  const messageElement = document.createElement("div");
  messageElement.className = `chat-message ${role}`;
  messageElement.textContent = text;
  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function appendSourcesMessage(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return;
  }

  const container = document.createElement("div");
  container.className = "chat-message sources";

  const title = document.createElement("p");
  title.className = "sources-title";
  title.textContent = "Sources";
  container.appendChild(title);

  const list = document.createElement("ul");
  list.className = "sources-list";

  sources.forEach((source) => {
    if (
      !source ||
      typeof source.url !== "string" ||
      typeof source.title !== "string"
    ) {
      return;
    }

    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = source.title;

    item.appendChild(link);
    list.appendChild(item);
  });

  if (list.children.length > 0) {
    container.appendChild(list);
    chatWindow.appendChild(container);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
}

function setDocumentDirection(direction) {
  const nextDirection = direction === "rtl" ? "rtl" : "ltr";
  document.documentElement.setAttribute("dir", nextDirection);
  toggleRtlBtn.setAttribute("aria-pressed", String(nextDirection === "rtl"));
  localStorage.setItem(DIRECTION_STORAGE_KEY, nextDirection);
}

function restoreDirection() {
  const savedDirection = localStorage.getItem(DIRECTION_STORAGE_KEY);
  if (savedDirection === "rtl" || savedDirection === "ltr") {
    setDocumentDirection(savedDirection);
  } else {
    setDocumentDirection("ltr");
  }
}

function setLoadingState(loading) {
  isLoading = loading;
  updateButtonStates();
}

function addHistoryMessage(role, content) {
  conversationHistory.push({ role, content });

  if (conversationHistory.length > MAX_HISTORY_TURNS) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY_TURNS);
  }
}

function getSelectedProductsPayload() {
  return [...selectedProductIds]
    .map((productId) => getProductById(productId))
    .filter(Boolean)
    .map((product) => ({
      id: String(product.id),
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description,
    }));
}

async function sendWorkerRequest(messageText) {
  const payload = {
    message: messageText,
    selectedProducts: getSelectedProductsPayload(),
    history: conversationHistory,
    routineContext,
    enableWebSearch: true,
  };

  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Worker request failed");
  }

  const data = await response.json();

  if (!data.reply || typeof data.reply !== "string") {
    throw new Error("Invalid Worker response");
  }

  return {
    reply: data.reply,
    sources: Array.isArray(data.sources) ? data.sources : [],
  };
}

function renderSelectedProducts() {
  if (selectedProductIds.size === 0) {
    selectedProductsList.innerHTML = `
      <p class="selected-placeholder">No products selected yet.</p>
    `;
    updateButtonStates();
    return;
  }

  const selectedProducts = [...selectedProductIds]
    .map((productId) => getProductById(productId))
    .filter(Boolean);

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
      <div class="selected-item" data-product-id="${product.id}">
        <p>${product.brand}: ${product.name}</p>
        <button class="remove-selected" aria-label="Remove ${product.name}">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `,
    )
    .join("");

  updateButtonStates();
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products found for this category
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProductIds.has(product.id);
      const isExpanded = expandedProductIds.has(product.id);

      return `
    <div
      class="product-card ${isSelected ? "selected" : ""} ${
        isExpanded ? "description-open" : ""
      }"
      data-product-id="${product.id}"
    >
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
        <button
          type="button"
          class="details-toggle"
          aria-expanded="${isExpanded}"
          aria-controls="${getDescriptionId(product.id)}"
        >
          ${isExpanded ? "Hide Details" : "View Details"}
        </button>
      </div>
      <div
        id="${getDescriptionId(product.id)}"
        class="product-description ${isExpanded ? "open" : ""}"
        aria-hidden="${!isExpanded}"
      >
        <p>${product.description}</p>
      </div>
    </div>
  `;
    })
    .join("");
}

function refreshVisibleProducts() {
  const selectedCategory = categoryFilter.value;
  const normalizedKeyword = currentSearchKeyword.trim().toLowerCase();

  const filteredProducts = allProducts.filter((product) => {
    const matchesCategory = selectedCategory
      ? product.category === selectedCategory
      : true;

    const matchesKeyword = normalizedKeyword
      ? product.name.toLowerCase().includes(normalizedKeyword) ||
        product.brand.toLowerCase().includes(normalizedKeyword) ||
        product.description.toLowerCase().includes(normalizedKeyword)
      : true;

    return matchesCategory && matchesKeyword;
  });

  if (!selectedCategory && !normalizedKeyword) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Choose a category or search for products
      </div>
    `;
    return;
  }

  displayProducts(filteredProducts);
}

function toggleProductSelection(productId) {
  const isAlreadySelected = selectedProductIds.has(productId);

  if (!isAlreadySelected && selectedProductIds.size >= MAX_SELECTED_PRODUCTS) {
    appendChatMessage(
      "system",
      `You can select up to ${MAX_SELECTED_PRODUCTS} products. Remove one to add another.`,
    );
    return;
  }

  if (isAlreadySelected) {
    selectedProductIds.delete(productId);
  } else {
    selectedProductIds.add(productId);
  }

  saveSelectedProducts();
  renderSelectedProducts();
  refreshVisibleProducts();
}

async function handleGenerateRoutine() {
  const selectedProducts = getSelectedProductsPayload();

  if (selectedProducts.length === 0) {
    appendChatMessage("system", "Select at least one product first.");
    return;
  }

  if (selectedProducts.length > MAX_SELECTED_PRODUCTS) {
    appendChatMessage(
      "system",
      `Please keep your selection to ${MAX_SELECTED_PRODUCTS} products or fewer.`,
    );
    return;
  }

  const userMessage = "Create a routine with these selected products";
  const requestMessage = `${TOPIC_GUIDANCE}\n\n${userMessage}`;

  appendChatMessage(
    "user",
    "Generate a personalized routine from my selected products.",
  );
  addHistoryMessage("user", userMessage);

  try {
    setLoadingState(true);
    const responseData = await sendWorkerRequest(requestMessage);
    appendChatMessage("assistant", responseData.reply);
    appendSourcesMessage(responseData.sources);
    addHistoryMessage("assistant", responseData.reply);
    routineContext = responseData.reply;
  } catch {
    appendChatMessage("system", REQUEST_ERROR_MESSAGE);
  } finally {
    setLoadingState(false);
  }
}

async function handleFollowUpSubmit(event) {
  event.preventDefault();

  const message = userInput.value.trim();

  if (!message || isLoading) {
    return;
  }

  if (!routineContext) {
    appendChatMessage(
      "system",
      "Generate a routine first, then ask follow-up questions.",
    );
    userInput.value = "";
    return;
  }

  appendChatMessage("user", message);
  addHistoryMessage("user", message);
  userInput.value = "";

  const requestMessage = `${TOPIC_GUIDANCE}\n\nFollow-up question: ${message}`;

  try {
    setLoadingState(true);
    const responseData = await sendWorkerRequest(requestMessage);
    appendChatMessage("assistant", responseData.reply);
    appendSourcesMessage(responseData.sources);
    addHistoryMessage("assistant", responseData.reply);
  } catch {
    appendChatMessage("system", REQUEST_ERROR_MESSAGE);
  } finally {
    setLoadingState(false);
  }
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", (event) => {
  categoryFilter.value = event.target.value;
  refreshVisibleProducts();
});

productSearch.addEventListener("input", (event) => {
  currentSearchKeyword = event.target.value;
  refreshVisibleProducts();
});

toggleRtlBtn.addEventListener("click", () => {
  const currentDirection =
    document.documentElement.getAttribute("dir") || "ltr";
  const nextDirection = currentDirection === "rtl" ? "ltr" : "rtl";
  setDocumentDirection(nextDirection);
});

productsContainer.addEventListener("click", (event) => {
  const detailsButton = event.target.closest(".details-toggle");

  if (detailsButton) {
    const card = detailsButton.closest(".product-card");
    const productId = Number(card.dataset.productId);

    if (expandedProductIds.has(productId)) {
      expandedProductIds.delete(productId);
    } else {
      expandedProductIds.add(productId);
    }

    refreshVisibleProducts();
    return;
  }

  const card = event.target.closest(".product-card");

  if (!card) {
    return;
  }

  const productId = Number(card.dataset.productId);
  toggleProductSelection(productId);
});

selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-selected");

  if (!removeButton) {
    return;
  }

  const selectedItem = removeButton.closest(".selected-item");
  const productId = Number(selectedItem.dataset.productId);

  selectedProductIds.delete(productId);
  saveSelectedProducts();
  renderSelectedProducts();
  refreshVisibleProducts();
});

clearSelectionsBtn.addEventListener("click", () => {
  if (selectedProductIds.size === 0) {
    return;
  }

  selectedProductIds.clear();
  saveSelectedProducts();
  renderSelectedProducts();
  refreshVisibleProducts();
  appendChatMessage("system", "All selected products were cleared.");
});

generateRoutineBtn.addEventListener("click", handleGenerateRoutine);
chatForm.addEventListener("submit", handleFollowUpSubmit);

async function init() {
  restoreDirection();
  allProducts = await loadProducts();
  restoreSelectedProducts();
  renderSelectedProducts();
  updateButtonStates();

  appendChatMessage(
    "system",
    "Select products and click Generate Routine to get started.",
  );
}

init();
