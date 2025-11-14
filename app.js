/*
 * D&D 5e Character Sheet - app.js
 *
 * This file contains all the JavaScript logic for the interactive character sheet.
 * It's loaded as a module by index.html.
 */

// --- MODULE-LEVEL STATE ---

// Character data is namespaced under this object.
// This is what will be saved to and loaded from "the cloud" (localStorage).
const CHARACTER_DATA = {
    // Core Stats
    hp: 34,
    temp_hp: 0,
    
    // Resource Trackers
    uses_second_wind: 3,
    uses_action_surge: 1,
    uses_giants_might: 2,
    uses_fire_rune: 1,
    uses_cloud_rune: 1,
    uses_tactical_mind: 3,
    
    // Status Effects
    status_giants_might: false,
    
    // Inventory & Coin
    inventory: [], // This will hold objects for weapons, armor, etc.
    coin: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    
    // Notes & Background
    notes: "",
    origin_story: ""
};

// A constant defining the base data structure for a new item.
// Not currently used by the add item forms, but good for reference.
const ITEM_DEFAULTS = {
    weapon: {
        id: "", name: "", type: "Weapon", equipped: false, proficient: true,
        attackType: "Melee", damage: "1d8", damageType: "Bludgeoning",
        reach: 5, weight: 2, cost: 1, properties: "Versatile (1d10)",
        notes: ""
    },
    armor: {
        id: "", name: "", type: "Armor", equipped: false, armorType: "Heavy",
        baseAC: 18, maxDex: 0, isProficient: true, stealthDisadvantage: true,
        weight: 65, cost: 1500, notes: ""
    }
};

// A simple in-memory cache for DOM elements to avoid repeated queries.
const ELEMENTS = {};

// --- INITIALIZATION ---

/**
 * Runs when the DOM is fully loaded.
 * Caches elements, sets up listeners, and initializes the UI.
 */
function onDomLoaded() {
    console.log("DOM loaded. Initializing sheet...");
    
    // 1. Cache all recurring DOM elements
    cacheDomElements();
    
    // 2. Set up all event listeners
    setupEventListeners();
    
    // 3. Initialize persistence (load data from localStorage)
    initializePersistence();
    
    // 4. Set the initial UI state (e.g., active tab)
    setInitialUiState();
    
    console.log("Sheet initialized.");
}

/**
 * Finds and stores all frequently used DOM elements in the ELEMENTS cache.
 */
function cacheDomElements() {
    // Splash & Main Content
    ELEMENTS.splashScreen = document.getElementById('splash-screen');
    ELEMENTS.mainContent = document.getElementById('main-content'); // This is the sheet's content area
    
    // --- NEWLY CACHED ELEMENTS ---
    ELEMENTS.mainMenu = document.getElementById('main-menu');
    ELEMENTS.characterSheetPage = document.getElementById('character-sheet-page');
    ELEMENTS.menuBtnLoadChar = document.getElementById('menu-btn-load-char');
    // --- END NEW ---
    
    // Navigation
    ELEMENTS.navContainer = document.getElementById('main-navigation');
    ELEMENTS.pageContainer = document.getElementById('page-container');
    
    // HP & Rest
    ELEMENTS.currentHpInput = document.getElementById('current-hp');
    ELEMENTS.maxHpSpan = document.getElementById('max-hp');
    ELEMENTS.tempHpInput = document.getElementById('temp-hp');
    ELEMENTS.acDisplay = document.getElementById('ac-display');
    ELEMENTS.longRestButton = document.getElementById('long-rest-button');
    ELEMENTS.shortRestButton = document.getElementById('short-rest-button');
    
    // Roll Displays
    ELEMENTS.skillRollDisplay = document.getElementById('skill-roll-display');
    ELEMENTS.saveRollDisplay = document.getElementById('save-roll-display');
    ELEMENTS.actionRollDisplay = document.getElementById('action-roll-display');
    
    // Dice Buttons
    ELEMENTS.diceRollerBar = document.getElementById('dice-roller-bar');
    
    // Resource Trackers (Spans)
    ELEMENTS.secondWindUses = document.getElementById('second-wind-uses');
    ELEMENTS.actionSurgeUses = document.getElementById('action-surge-uses');
    ELEMENTS.giantsMightUses = document.getElementById('giants-might-uses');
    ELEMENTS.fireRuneUses = document.getElementById('fire-rune-uses');
    ELEMENTS.cloudRuneUses = document.getElementById('cloud-rune-uses');
    ELEMENTS.tacticalMindUses = document.getElementById('tactical-mind-uses');
    
    // Resource Buttons
    ELEMENTS.rollSecondWind = document.getElementById('roll-second-wind');
    ELEMENTS.useActionSurge = document.getElementById('use-action-surge');
    ELEMENTS.activateGiantsMight = document.getElementById('activate-giants-might');
    ELEMENTS.deactivateGiantsMight = document.getElementById('deactivate-giants-might');
    ELEMENTS.rollFireRuneDmg = document.getElementById('roll-fire-rune-dmg');
    ELEMENTS.useCloudRune = document.getElementById('use-cloud-rune');
    ELEMENTS.rollTacticalMind = document.getElementById('roll-tactical-mind');
    
    // Status Indicators
    ELEMENTS.giantsMightStatus = document.getElementById('giants-might-status');
    
    // Saves & Skills
    ELEMENTS.strSaveBonus = document.getElementById('str-save-bonus');
    ELEMENTS.dexSaveBonus = document.getElementById('dex-save-bonus');
    ELEMENTS.conSaveBonus = document.getElementById('con-save-bonus');
    ELEMENTS.intSaveBonus = document.getElementById('int-save-bonus');
    ELEMENTS.wisSaveBonus = document.getElementById('wis-save-bonus');
    ELEMENTS.chaSaveBonus = document.getElementById('cha-save-bonus');
    
    // Text Areas (for saving)
    ELEMENTS.notesTextarea = document.getElementById('notes-content-textarea');
    ELEMENTS.originStoryTextarea = document.getElementById('origin-story-textarea');
    
    // Inventory & Coinage
    ELEMENTS.inventoryListContainer = document.getElementById('inventory-list-container');
    ELEMENTS.actionsList = document.getElementById('actions-list');
    ELEMENTS.itemTypeSelect = document.getElementById('item-type-select');
    ELEMENTS.weaponForm = document.getElementById('weapon-form-container');
    ELEMENTS.armorForm = document.getElementById('armor-form-container');
    ELEMENTS.otherForm = document.getElementById('other-form-placeholder');
    
    ELEMENTS.coin = {
        pp_display: document.getElementById('coin-pp-display'),
        gp_display: document.getElementById('coin-gp-display'),
        ep_display: document.getElementById('coin-ep-display'),
        sp_display: document.getElementById('coin-sp-display'),
        cp_display: document.getElementById('coin-cp-display'),
        pp_input: document.getElementById('coin-pp-input'),
        gp_input: document.getElementById('coin-gp-input'),
        ep_input: document.getElementById('coin-ep-input'),
        sp_input: document.getElementById('coin-sp-input'),
        cp_input: document.getElementById('coin-cp-input')
    };
}

/**
 * Attaches all the necessary event listeners to the cached elements.
 */
function setupEventListeners() {
    
    // Splash Screen
    ELEMENTS.splashScreen.addEventListener('click', handleSplashClick, { once: true });

    // --- NEW LISTENER ---
    // Main Menu Button
    ELEMENTS.menuBtnLoadChar.addEventListener('click', handleLoadCharacter);
    // --- END NEW ---

    // Main Content Click/Input Listeners (Event Delegation)
    ELEMENTS.mainContent.addEventListener('click', handleMainContentClick);
    ELEMENTS.mainContent.addEventListener('input', handleMainContentInput);

    // Navigation Listener (Event Delegation)
    ELEMENTS.navContainer.addEventListener('click', handleNavigation);
    
    // Textarea listeners (Debounced for performance)
    ELEMENTS.notesTextarea.addEventListener('input', debouncedNotesChange); 
    ELEMENTS.originStoryTextarea.addEventListener('input', debouncedOriginStoryChange);
    
    // Inventory Form Selector
    ELEMENTS.itemTypeSelect.addEventListener('change', handleInventoryFormChange);
}

/**
 * Sets the initial state of the UI on load (e.g., active tab).
 */
function setInitialUiState() {
    // Set the default "Main" button to active on load
    const defaultButton = document.querySelector('.nav-button[data-page="page-main"]');
    if (defaultButton) {
        defaultButton.classList.add('active');
        // Note: The 'active' class in CSS now handles the border, so JS
        // manipulation of border style is no longer needed.
    }
    
    // Hide all pages except the main one
    const pages = ELEMENTS.pageContainer.querySelectorAll('.page-content');
    pages.forEach(page => {
        if (page.id !== 'page-main') {
            page.classList.add('hidden');
        } else {
            page.classList.remove('hidden');
        }
    });
}

// --- EVENT HANDLERS ---

/**
 * Fades out the splash screen and fades in the main content.
 */
// --- MODIFIED FUNCTION ---
function handleSplashClick() {
    ELEMENTS.splashScreen.style.opacity = '0';
    
    // NEW: Show the main menu instead of the character sheet
    ELEMENTS.mainMenu.classList.remove('hidden');
    
    // After the fade-out, remove the splash screen from the DOM
    setTimeout(() => {
        ELEMENTS.splashScreen.remove();
    }, 500); // Matches the CSS transition duration
}
// --- END MODIFICATION ---

/**
 * --- NEW FUNCTION ---
 * Hides the main menu and shows the character sheet.
 */
function handleLoadCharacter() {
    ELEMENTS.mainMenu.classList.add('hidden');
    ELEMENTS.characterSheetPage.classList.remove('hidden');
    
    // We can now "load" the main content of the sheet
    // This re-uses the original fade-in logic by adding the 'loaded' class
    ELEMENTS.mainContent.classList.add('loaded');
}
// --- END NEW FUNCTION ---

/**
 * Handles all click events within the main content area using delegation.
 */
function handleMainContentClick(event) {
    const target = event.target;
    const targetClosest = (selector) => target.closest(selector);

    // --- HP Buttons ---
    if (target === document.getElementById('hp-plus-button')) {
        modifyHp(1);
    } else if (target === document.getElementById('hp-minus-button')) {
        modifyHp(-1);
        
    // --- Rest Buttons ---
    } else if (target === ELEMENTS.longRestButton) {
        handleLongRest();
    } else if (target === ELEMENTS.shortRestButton) {
        handleShortRest();
        
    // --- Rollable Skills ---
    } else if (targetClosest('.skill-rollable')) {
        handleSkillRoll(targetClosest('.skill-rollable'));
        
    // --- Rollable Saves ---
    } else if (targetClosest('.save-rollable')) {
        handleSaveRoll(targetClosest('.save-rollable'));
        
    // --- Quick Dice Bar ---
    } else if (targetClosest('.dice-button-svg')) {
        handleQuickDieRoll(targetClosest('.dice-button-svg'));
        
    // --- Action Card Buttons ---
    } else if (targetClosest('.action-roll-button')) {
        handleActionRoll(targetClosest('.action-roll-button'));
        
    // --- Inventory Add Buttons ---
    } else if (target.id === 'add-weapon-button') {
        addNewWeapon();
    } else if (target.id === 'add-armor-button') {
        addNewArmor();
        
    // --- Inventory Item Buttons (Equip/Delete) ---
    } else if (targetClosest('.inventory-equip-button')) {
        toggleEquipItem(targetClosest('.inventory-equip-button').dataset.itemId);
    } else if (targetClosest('.inventory-delete-button')) {
        deleteItem(targetClosest('.inventory-delete-button').dataset.itemId);
        
    // --- Coinage Buttons ---
    } else if (target.id === 'coin-add-button') {
        modifyCoin('add');
    } else if (target.id === 'coin-remove-button') {
        modifyCoin('remove');
    } else if (target.id === 'coin-clear-button') {
        clearCoinInputs();
    }
}

/**
 * Handles all input events (like typing) within the main content area.
 */
function handleMainContentInput(event) {
    const target = event.target;
    
    // HP/Temp HP Manual Input
    if (target === ELEMENTS.currentHpInput || target === ELEMENTS.tempHpInput) {
        handleHpChange(event);
    }
    
    // Note: Textarea inputs are handled by their own specific debounced
    // listeners for performance, not by this general handler.
}

/**
 * Handles page navigation by switching active tabs and showing/hiding pages.
 */
function handleNavigation(event) {
    const navButton = event.target.closest('.nav-button');
    if (!navButton) return;

    const pageId = navButton.dataset.page;
    if (!pageId) return;

    // 1. Update Navigation Buttons
    // Remove 'active' from all buttons
    ELEMENTS.navContainer.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
    });
    // Add 'active' to the clicked button
    navButton.classList.add('active');

    // 2. Show/Hide Page Content
    // Hide all pages
    ELEMENTS.pageContainer.querySelectorAll('.page-content').forEach(page => {
        page.classList.add('hidden');
    });
    // Show the target page
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.remove('hidden');
    } else {
        console.error(`Navigation error: Page with ID "${pageId}" not found.`);
        // Show the main page as a fallback
        document.getElementById('page-main').classList.remove('hidden');
    }
}

/**
 * Handles changes to the HP or Temp HP input fields.
 */
function handleHpChange(event) {
    const input = event.target;
    let value = parseInt(input.value, 10);
    
    // Ensure value is a number, default to 0 if not
    if (isNaN(value)) {
        value = 0;
    }

    if (input === ELEMENTS.currentHpInput) {
        // Clamp current HP between 0 and Max HP
        const maxHp = parseInt(ELEMENTS.maxHpSpan.textContent, 10);
        if (value > maxHp) {
            value = maxHp;
            input.value = value; // Correct the input field
        } else if (value < 0) {
            value = 0;
            input.value = value;
        }
        CHARACTER_DATA.hp = value;
        
    } else if (input === ELEMENTS.tempHpInput) {
        // Temp HP can't be negative
        if (value < 0) {
            value = 0;
            input.value = value;
        }
        CHARACTER_DATA.temp_hp = value;
    }
    
    // Save the change
    saveCharacterData();
}

/**
 * Rolls a skill check based on the clicked skill element.
 */
function handleSkillRoll(skillElement) {
    const skillName = skillElement.dataset.skillName;
    const modifier = parseInt(skillElement.dataset.modifier, 10);
    const rollType = skillElement.dataset.rollType; // 'normal', 'advantage', 'disadvantage'

    const roll = rollD20(rollType);
    const total = roll.finalResult + modifier;
    const resultText = `${skillName}: ${total} [${roll.resultText} + ${modifier}]`;

    displayRoll(ELEMENTS.skillRollDisplay, resultText, roll.isCrit, roll.isFumble);
}

/**
 * Rolls a saving throw based on the clicked save element.
 */
function handleSaveRoll(saveElement) {
    const saveName = saveElement.dataset.saveName;
    const modifier = parseInt(saveElement.dataset.modifier, 10);
    const stat = saveElement.dataset.stat; // e.g., "STR"
    
    let rollType = 'normal';
    
    // Check for Giant's Might advantage
    if (CHARACTER_DATA.status_giants_might && (stat === "STR" || stat === "CON")) {
        rollType = 'advantage';
    }

    const roll = rollD20(rollType);
    const total = roll.finalResult + modifier;
    
    let resultText = `${saveName}: ${total} [${roll.resultText} + ${modifier}]`;
    if (rollType === 'advantage') {
        resultText += " (Adv)";
    }

    displayRoll(ELEMENTS.saveRollDisplay, resultText, roll.isCrit, roll.sFumble);
}

/**
 * Rolls a generic die from the quick-roll bar.
 */
function handleQuickDieRoll(dieButton) {
    const dieSize = parseInt(dieButton.dataset.die, 10);
    if (isNaN(dieSize)) return;

    const result = rollSimpleDie(dieSize);
    const resultText = `D${dieSize} Roll: ${result}`;
    
    // Display in the skill roll display as it's the most central one
    displayRoll(ELEMENTS.skillRollDisplay, resultText);
}

// ... (Other functions like handleActionRoll, handleLongRest, etc. would go here)
// ... (Dice rolling logic, persistence logic, inventory logic would also go here)

// --- DEBOUNCED HANDLERS ---

/**
 * Debounce function to limit how often a function can run.
 * Used for saving textarea content to avoid saving on every keystroke.
 */
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

/**
 * Saves the notes text area content.
 */
function handleNotesChange(event) {
    CHARACTER_DATA.notes = event.target.value;
    saveCharacterData();
}

/**
 * Saves the origin story text area content.
 */
function handleOriginStoryChange(event) {
    CHARACTER_DATA.origin_story = event.target.value;
    saveCharacterData();
}

// Create debounced versions of the save functions
const debouncedNotesChange = debounce(handleNotesChange, 500);
const debouncedOriginStoryChange = debounce(handleOriginStoryChange, 500);


// --- DUMMY/PLACEHOLDER FUNCTIONS ---
// These are functions that would be built out to provide
// the full functionality seen in the HTML.

function modifyHp(amount) {
    console.log(`Modifying HP by ${amount}`);
    let currentHp = parseInt(ELEMENTS.currentHpInput.value, 10);
    currentHp += amount;
    ELEMENTS.currentHpInput.value = currentHp;
    
    // Manually trigger the input event to save the data
    ELEMENTS.currentHpInput.dispatchEvent(new Event('input'));
}

function handleLongRest() {
    console.log("Performing Long Rest...");
    alert("Performing a Long Rest. HP and resources would be reset.");
    // Logic to reset HP, resource uses (e.g., CHARACTER_DATA.uses_second_wind = 3), etc.
    // Then update UI and save.
}

function handleShortRest() {
    console.log("Performing Short Rest...");
    alert("Performing a Short Rest. Action Surge and Runes would be reset.");
    // Logic to reset short rest resources.
    // Then update UI and save.
}

function handleActionRoll(button) {
    const roll = button.dataset.roll;
    const rollName = button.dataset.rollName;
    console.log(`Rolling action: ${rollName} (${roll})`);
    
    // Simple dice expression parser (placeholder)
    if (roll && roll.includes('d')) {
        const [num, rest] = roll.split('d');
        const [size, mod] = rest.split('+');
        const numDice = parseInt(num, 10);
        const dieSize = parseInt(size, 10);
        const modifier = mod ? parseInt(mod, 10) : 0;
        
        let total = 0;
        for (let i = 0; i < numDice; i++) {
            total += rollSimpleDie(dieSize);
        }
        const finalTotal = total + modifier;
        
        const resultText = `${rollName}: ${finalTotal} [${total} + ${modifier}]`;
        displayRoll(ELEMENTS.actionRollDisplay, resultText);
    } else {
        displayRoll(ELEMENTS.actionRollDisplay, `${rollName} used.`);
    }
}

function rollD20(type = 'normal') {
    const roll1 = rollSimpleDie(20);
    const roll2 = rollSimpleDie(20);
    let finalResult, resultText;

    if (type === 'advantage') {
        finalResult = Math.max(roll1, roll2);
        resultText = `(${roll1}, ${roll2}) Adv`;
    } else if (type === 'disadvantage') {
        finalResult = Math.min(roll1, roll2);
        resultText = `(${roll1}, ${roll2}) Dis`;
    } else {
        finalResult = roll1;
        resultText = `${roll1}`;
    }

    return {
        finalResult: finalResult,
        resultText: resultText,
        isCrit: finalResult === 20,
        isFumble: finalResult === 1
    };
}

function rollSimpleDie(size) {
    return Math.floor(Math.random() * size) + 1;
}

function displayRoll(displayElement, text, isCrit = false, isFumble = false) {
    displayElement.textContent = text;
    
    // Simple visual flair for crits/fumbles
    displayElement.style.color = isCrit ? '#ecc94b' : (isFumble ? '#f56565' : '#e2e8f0');
    displayElement.style.fontWeight = (isCrit || isFumble) ? 'bold' : 'normal';
}

function handleInventoryFormChange() {
    const selected = ELEMENTS.itemTypeSelect.value;
    ELEMENTS.weaponForm.classList.add('hidden');
    ELEMENTS.armorForm.classList.add('hidden');
    ELEMENTS.otherForm.classList.add('hidden');
    
    if (selected === 'Weapon') {
        ELEMENTS.weaponForm.classList.remove('hidden');
    } else if (selected === 'Armor') {
        ELEMENTS.armorForm.classList.remove('hidden');
    } else if (selected === 'Other') {
        ELEMENTS.otherForm.classList.remove('hidden');
    }
}

function addNewWeapon() { alert("Weapon added (Placeholder)"); }
function addNewArmor() { alert("Armor added (Placeholder)"); }
function toggleEquipItem(itemId) { alert(`Toggled equip for ${itemId} (Placeholder)`); }
function deleteItem(itemId) { alert(`Deleted ${itemId} (Placeholder)`); }
function modifyCoin(action) { alert(`Coin ${action}ed (Placeholder)`); }
function clearCoinInputs() { alert("Coin inputs cleared (Placeholder)"); }

// --- PERSISTENCE (localStorage) ---

const SAVE_KEY = 'dnd_character_sheet_data_thangrim';

function saveCharacterData() {
    try {
        const dataString = JSON.stringify(CHARACTER_DATA);
        localStorage.setItem(SAVE_KEY, dataString);
        console.log("Character data saved.");
    } catch (error) {
        console.error("Failed to save character data:", error);
    }
}

function loadCharacterData() {
    try {
        const dataString = localStorage.getItem(SAVE_KEY);
        if (dataString) {
            const loadedData = JSON.parse(dataString);
            // Merge loaded data into the CHARACTER_DATA object
            // This preserves defaults if new properties are added to the code
            Object.assign(CHARACTER_DATA, loadedData);
            console.log("Character data loaded.");
        } else {
            console.log("No saved data found. Using defaults.");
        }
    } catch (error) {
        console.error("Failed to load character data:", error);
        // If data is corrupted, we might want to back it up and reset
        localStorage.setItem(SAVE_KEY + '_corrupted_' + Date.now(), localStorage.getItem(SAVE_KEY));
        localStorage.removeItem(SAVE_KEY);
    }
}

/**
 * Updates all UI elements to reflect the values in the CHARACTER_DATA object.
 */
function updateUiFromData() {
    console.log("Updating UI from loaded data...");
    
    // HP
    ELEMENTS.currentHpInput.value = CHARACTER_DATA.hp;
    ELEMENTS.tempHpInput.value = CHARACTER_DATA.temp_hp;
    
    // Resources
    ELEMENTS.secondWindUses.textContent = CHARACTER_DATA.uses_second_wind;
    ELEMENTS.actionSurgeUses.textContent = CHARACTER_DATA.uses_action_surge;
    ELEMENTS.giantsMightUses.textContent = CHARACTER_DATA.uses_giants_might;
    ELEMENTS.fireRuneUses.textContent = CHARACTER_DATA.uses_fire_rune;
    ELEMENTS.cloudRuneUses.textContent = CHARACTER_DATA.uses_cloud_rune;
    ELEMENTS.tacticalMindUses.textContent = CHARACTER_DATA.uses_tactical_mind;

    // Text Areas
    ELEMENTS.notesTextarea.value = CHARACTER_DATA.notes;
    ELEMENTS.originStoryTextarea.value = CHARACTER_DATA.origin_story;
    
    // Coin
    ELEMENTS.coin.pp_display.textContent = CHARACTER_DATA.coin.pp;
    ELEMENTS.coin.gp_display.textContent = CHARACTER_DATA.coin.gp;
    ELEMENTS.coin.ep_display.textContent = CHARACTER_DATA.coin.ep;
    ELEMENTS.coin.sp_display.textContent = CHARACTER_DATA.coin.sp;
    ELEMENTS.coin.cp_display.textContent = CHARACTER_DATA.coin.cp;
    
    // Statuses
    updateGiantsMightStatus(CHARACTER_DATA.status_giants_might);

    // Inventory
    renderInventory();
    
    // Resource Button States (e.g., disable if uses = 0)
    updateResourceButtonStates();
    
    console.log("UI update complete.");
}

/**
 * Initializes the persistence layer: loads data, then updates the UI.
 */
function initializePersistence() {
    loadCharacterData();
    updateUiFromData();
}

// --- PLACEHOLDER FUNCTIONS FOR UI UPDATES ---
// (These would be more built-out in a full app)

function updateGiantsMightStatus(isActive) {
    // This function would update the "Giant's Might" status tag,
    // show/hide the "Deactivate" button, and apply/remove
    // the (Adv) bonus to STR/CON saves.
    console.log(`Setting Giant's Might status to: ${isActive}`);
}

function renderInventory() {
    // This function would clear and re-render the inventory list
    // and the equipped weapons on the Actions page based on
    // the CHARACTER_DATA.inventory array.
    console.log("Rendering inventory (Placeholder)");
}

function updateResourceButtonStates() {
    // This function would check CHARACTER_DATA.uses_...
    // and add the 'disabled' attribute to buttons
    // if the resource is at 0 uses.
    console.log("Updating resource button disabled states (Placeholder)");
}


// --- APP ENTRY POINT ---

// Wait for the DOM to be fully loaded before running the app.
// This is crucial because the script is loaded as a module in the <head>.
document.addEventListener('DOMContentLoaded', onDomLoaded);