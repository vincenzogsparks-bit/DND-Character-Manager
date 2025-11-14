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
    // --- MERGED FROM MONOLITHIC FILE & NEW LOGIC ---
    
    // Page Containers
    ELEMENTS.splashScreen = document.getElementById('splash-screen');
    ELEMENTS.mainContent = document.getElementById('main-content');
    ELEMENTS.mainMenu = document.getElementById('main-menu');
    ELEMENTS.characterSheetPage = document.getElementById('character-sheet-page');
    ELEMENTS.pageContainer = document.getElementById('page-container');
    
    // Menu Buttons
    ELEMENTS.loadCharThangrim = document.getElementById('load-char-thangrim');
    ELEMENTS.returnToMenuButton = document.getElementById('return-to-menu-button');

    // Navigation
    ELEMENTS.navContainer = document.getElementById('main-navigation');
    
    // Header / Core Stats
    ELEMENTS.currentHpInput = document.getElementById('current-hp');
    ELEMENTS.maxHpSpan = document.getElementById('max-hp');
    ELEMENTS.tempHpInput = document.getElementById('temp-hp');
    ELEMENTS.hpPlusButton = document.getElementById('hp-plus-button');
    ELEMENTS.hpMinusButton = document.getElementById('hp-minus-button');
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
    ELEMENTS.giantsMightCard = document.getElementById('giants-might-card');

    // Saves & Skills
    ELEMENTS.skillsContainer = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-3');
    ELEMENTS.savesContainer = document.querySelector('.bg-gray-800 ul.space-y-2');
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
        cp_input: document.getElementById('coin-cp-input'),
        add: document.getElementById('coin-add-button'),
        remove: document.getElementById('coin-remove-button'),
        clear: document.getElementById('coin-clear-button')
    };

    // Inventory Forms (Weapon)
    ELEMENTS.weaponFormInputs = {
        name: document.getElementById('weapon-name'),
        proficiency: document.getElementById('weapon-proficiency'),
        attackType: document.getElementById('weapon-attack-type'),
        damage: document.getElementById('weapon-damage'),
        damageType: document.getElementById('weapon-damage-type'),
        reach: document.getElementById('weapon-reach'),
        weight: document.getElementById('weapon-weight'),
        cost: document.getElementById('weapon-cost'),
        properties: document.getElementById('weapon-properties'),
        notes: document.getElementById('weapon-notes'),
        addButton: document.getElementById('add-weapon-button')
    };
    
    // Inventory Forms (Armor)
    ELEMENTS.armorFormInputs = {
        name: document.getElementById('armor-name'),
        type: document.getElementById('armor-type'),
        ac: document.getElementById('armor-ac'),
        maxDex: document.getElementById('armor-max-dex'),
        isProficient: document.getElementById('armor-is-proficient'),
        weight: document.getElementById('armor-weight'),
        cost: document.getElementById('armor-cost'),
        stealthDisadvantage: document.getElementById('armor-stealth-disadvantage'),
        notes: document.getElementById('armor-notes'),
        addButton: document.getElementById('add-armor-button')
    };
}

/**
 * Attaches all the necessary event listeners to the cached elements.
 */
function setupEventListeners() {
    // --- MERGED FROM MONOLITHIC FILE & NEW LOGIC ---

    // Page Navigation
    ELEMENTS.splashScreen.addEventListener('click', handleSplashClick, { once: true });
    if (ELEMENTS.loadCharThangrim) {
        ELEMENTS.loadCharThangrim.addEventListener('click', handleLoadCharacter);
    }
    if (ELEMENTS.returnToMenuButton) {
        ELEMENTS.returnToMenuButton.addEventListener('click', handleReturnToMenu);
    }

    // Sheet Internal Navigation
    ELEMENTS.navContainer.addEventListener('click', handleNavigation);
    
    // HP & Rest
    ELEMENTS.currentHpInput.addEventListener('input', handleHpChange);
    ELEMENTS.tempHpInput.addEventListener('input', handleHpChange);
    ELEMENTS.hpPlusButton.addEventListener('click', () => modifyHp(1));
    ELEMENTS.hpMinusButton.addEventListener('click', () => modifyHp(-1));
    ELEMENTS.longRestButton.addEventListener('click', handleLongRest);
    ELEMENTS.shortRestButton.addEventListener('click', handleShortRest);
    
    // Textarea listeners (Debounced for performance)
    ELEMENTS.notesTextarea.addEventListener('input', debouncedNotesChange); 
    ELEMENTS.originStoryTextarea.addEventListener('input', debouncedOriginStoryChange);
    
    // Rollable Listeners (Event Delegation)
    ELEMENTS.skillsContainer.addEventListener('click', (e) => {
        const skillElement = e.target.closest('.skill-rollable');
        if (skillElement) handleSkillRoll(skillElement);
    });
    
    ELEMENTS.savesContainer.addEventListener('click', (e) => {
        const saveElement = e.target.closest('.save-rollable');
        if (saveElement) handleSaveRoll(saveElement);
    });
    
    ELEMENTS.diceRollerBar.addEventListener('click', (e) => {
        const dieButton = e.target.closest('.dice-button-svg');
        if (dieButton) handleQuickDieRoll(dieButton);
    });
    
    // Action Page Listeners (Delegation)
    document.getElementById('page-actions').addEventListener('click', (e) => {
        const actionButton = e.target.closest('.action-roll-button');
        if (actionButton) handleActionRoll(actionButton);
    });

    // Inventory Page Listeners
    ELEMENTS.itemTypeSelect.addEventListener('change', () => handleInventoryFormChange(ELEMENTS.itemTypeSelect.value));
    ELEMENTS.weaponFormInputs.addButton.addEventListener('click', addNewWeapon);
    ELEMENTS.armorFormInputs.addButton.addEventListener('click', addNewArmor);
    
    // Inventory List (Delegation)
    ELEMENTS.inventoryListContainer.addEventListener('click', (e) => {
        const equipButton = e.target.closest('.inventory-equip-button');
        const deleteButton = e.target.closest('.inventory-delete-button');
        if (equipButton) {
            toggleEquipItem(equipButton.dataset.itemId);
        }
        if (deleteButton) {
            deleteItem(deleteButton.dataset.itemId);
        }
    });
    
    // Coinage
    ELEMENTS.coin.add.addEventListener('click', () => modifyCoin('add'));
    ELEMENTS.coin.remove.addEventListener('click', () => modifyCoin('remove'));
    ELEMENTS.coin.clear.addEventListener('click', clearCoinInputs);
}

// --- PAGE NAVIGATION HANDLERS (NEW) ---

/**
 * Fades out the splash screen and fades in the main menu.
 */
function handleSplashClick() {
    ELEMENTS.splashScreen.style.opacity = '0';
    ELEMENTS.mainMenu.classList.remove('hidden');
    ELEMENTS.mainMenu.classList.add('loaded');
    
    // After the fade-out, remove the splash screen from the DOM
    setTimeout(() => {
        ELEMENTS.splashScreen.remove();
    }, 500); // Matches the CSS transition duration
}

/**
 * Hides the main menu and shows the character sheet.
 */
function handleLoadCharacter() {
    // Hide the main menu
    ELEMENTS.mainMenu.classList.add('hidden');
    ELEMENTS.mainMenu.classList.remove('loaded'); // Prepare for re-fade-in
    
    // Show the character sheet page container
    ELEMENTS.characterSheetPage.classList.remove('hidden');
    // Trigger the fade-in for the character sheet
    ELEMENTS.characterSheetPage.classList.add('loaded');
}

/**
 * Hides the character sheet and returns to the main menu.
 */
function handleReturnToMenu() {
    // Hide the character sheet
    ELEMENTS.characterSheetPage.classList.add('hidden');
    ELEMENTS.characterSheetPage.classList.remove('loaded'); // Prepare for re-fade-in
    
    // Show the main menu
    ELEMENTS.mainMenu.classList.remove('hidden');
    // Trigger the fade-in for the main menu
    ELEMENTS.mainMenu.classList.add('loaded');

    // Reset the character sheet to the "Main" tab for next load
    setInitialUiState();
}

// --- CHARACTER SHEET NAVIGATION & STATE ---

/**
 * Sets the initial state of the UI on load (e.g., active tab).
 */
function setInitialUiState() {
    // Set the default "Main" button to active on load
    const defaultButton = document.querySelector('.nav-button[data-page="page-main"]');
    if (defaultButton) {
        defaultButton.classList.add('active');
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

// --- DEBOUNCED HANDLERS ---

/**
 * Debounce function to limit how often a function can run.
 */
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

const debouncedNotesChange = debounce((event) => {
    CHARACTER_DATA.notes = event.target.value;
    saveCharacterData();
}, 500);

const debouncedOriginStoryChange = debounce((event) => {
    CHARACTER_DATA.origin_story = event.target.value;
    saveCharacterData();
}, 500);

// --- DICE ROLLING LOGIC ---

/**
 * Rolls a simple die of a given size.
 */
function rollSimpleDie(size) {
    return Math.floor(Math.random() * size) + 1;
}

/**
 * Rolls a d20 with optional advantage or disadvantage.
 */
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

/**
 * Parses a dice string (e.g., "2d6+3") and rolls the dice.
 * Applies Great Weapon Fighting logic if applicable.
 */
function rollDiceString(diceString, isGreatWeapon = false) {
    let numDice = 1;
    let dieSize = 20;
    let modifier = 0;

    const modMatch = diceString.match(/[+-]\d+$/);
    if (modMatch) {
        modifier = parseInt(modMatch[0], 10);
        diceString = diceString.slice(0, modMatch.index);
    }

    const diceMatch = diceString.match(/(\d+)d(\d+)/i);
    if (diceMatch) {
        numDice = parseInt(diceMatch[1], 10);
        dieSize = parseInt(diceMatch[2], 10);
    } else {
        // Handle static damage (e.g., "6")
        const staticDmg = parseInt(diceString, 10);
        if (!isNaN(staticDmg)) {
            return { total: staticDmg + modifier, rollText: `${staticDmg}` };
        }
    }

    let total = 0;
    let rolls = [];
    for (let i = 0; i < numDice; i++) {
        let roll = rollSimpleDie(dieSize);
        // Great Weapon Fighting logic
        if (isGreatWeapon && (roll === 1 || roll === 2)) {
            roll = 3; // Treat 1s and 2s as 3s
        }
        total += roll;
        rolls.push(roll);
    }

    return {
        total: total + modifier,
        rollText: `(${rolls.join('+')})`
    };
}

/**
 * Displays a roll result in a specified element.
 * Applies visual flair for crits/fumbles.
 * Highlights the associated card on a crit.
 */
function displayRoll(displayElement, text, isCrit = false, isFumble = false, cardElement = null) {
    displayElement.textContent = text;
    
    // Visual flair for crits/fumbles
    displayElement.style.color = isCrit ? '#ecc94b' : (isFumble ? '#f56565' : '#e2e8f0');
    displayElement.style.fontWeight = (isCrit || isFumble) ? 'bold' : 'normal';

    // Remove crit glow from all cards
    document.querySelectorAll('.action-card.crit').forEach(card => card.classList.remove('crit'));

    // Add crit glow to the specific card
    if (isCrit && cardElement) {
        cardElement.classList.add('crit');
    }
}

// --- CORE ROLLING HANDLERS ---

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

    displayRoll(ELEMENTS.saveRollDisplay, resultText, roll.isCrit, roll.isFumble);
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

// --- ACTION PAGE LOGIC ---

/**
 * Main handler for all clicks on .action-roll-button
 * Routes to the correct function based on data-roll-type.
 */
function handleActionRoll(button) {
    const rollType = button.dataset.rollType;
    const card = button.closest('.action-card');
    
    // Route to the correct logic
    switch (rollType) {
        case 'hit':
        case 'damage':
        case 'damage-rune':
        case 'static':
            rollAttackOrDamage(button, card, rollType);
            break;
        case 'heal':
            useSecondWind(button, card);
            break;
        case 'use-action':
            useActionSurge(button, card);
            break;
        case 'use-rune':
            useCloudRune(button, card);
            break;
        case 'roll': // Generic roll, e.g., Tactical Mind
            useTacticalMind(button, card);
            break;
        case 'activate': // Giant's Might
            toggleGiantsMight(true);
            break;
        case 'deactivate': // Giant's Might
            toggleGiantsMight(false);
            break;
        default:
            console.warn(`Unknown action roll type: ${rollType}`);
            displayRoll(ELEMENTS.actionRollDisplay, `Unknown action: ${rollType}`);
    }
}

/**
 * Handles rolling for attacks or damage from an action card.
 */
function rollAttackOrDamage(button, card, rollType) {
    const rollString = button.dataset.roll;
    const rollName = button.dataset.rollName;
    const attackType = button.dataset.attackType; // "Melee" or "Ranged"
    
    let resultText = `${rollName}: `;
    let isCrit = false;
    let isFumble = false;

    // --- Attack Roll (Hit) ---
    if (rollType === 'hit') {
        let rollType = 'normal';
        // Check for Giant's Might STR advantage
        if (CHARACTER_DATA.status_giants_might && attackType === "Melee") {
            rollType = 'advantage';
        }
        
        const d20 = rollD20(rollType);
        const [_, mod] = rollString.split('+');
        const modifier = parseInt(mod, 10);
        const total = d20.finalResult + modifier;

        resultText += `${total} [${d20.resultText} + ${modifier}]`;
        if (rollType === 'advantage') resultText += " (Adv)";
        
        isCrit = d20.isCrit;
        isFumble = d20.isFumble;

    // --- Damage Roll (Dice) ---
    } else if (rollType === 'damage' || rollType === 'damage-rune') {
        // Check for Great Weapon Fighting (only for 'damage' type, not 'damage-rune')
        const isGreatWeapon = rollType === 'damage' && (attackType === 'Melee'); // Simplified: assume GWF for all melee
        
        const roll = rollDiceString(rollString, isGreatWeapon);
        
        // Add Giant's Might extra 1d6 damage
        let giantsMightText = "";
        if (CHARACTER_DATA.status_giants_might) {
            const giantsMightRoll = rollSimpleDie(6);
            roll.total += giantsMightRoll;
            giantsMightText = ` + ${giantsMightRoll}[GM]`;
        }
        
        resultText += `${roll.total} [${roll.rollText}${giantsMightText}] Damage`;

        // Consume Fire Rune use
        if (rollType === 'damage-rune') {
            consumeResource('fire_rune', ELEMENTS.fireRuneUses, button);
        }
        
    // --- Static Damage (No Dice) ---
    } else if (rollType === 'static') {
        const dmg = parseInt(rollString, 10);
        let total = dmg;
        let giantsMightText = "";
        
        // Add Giant's Might extra 1d6 damage
        if (CHARACTER_DATA.status_giants_might) {
            const giantsMightRoll = rollSimpleDie(6);
            total += giantsMightRoll;
            giantsMightText = ` + ${giantsMightRoll}[GM]`;
        }
        resultText += `${total} [${dmg}${giantsMightText}] Damage`;
    }
    
    displayRoll(ELEMENTS.actionRollDisplay, resultText, isCrit, isFumble, card);
}

/**
 * Handles "Second Wind" ability.
 * Rolls heal, adds to HP, consumes a use.
 */
function useSecondWind(button, card) {
    if (CHARACTER_DATA.uses_second_wind <= 0) {
        displayRoll(ELEMENTS.actionRollDisplay, "No uses of Second Wind remaining.", false, false, card);
        return;
    }
    
    const rollString = button.dataset.roll; // "1d10+4"
    const rollName = button.dataset.rollName;
    
    const roll = rollDiceString(rollString);
    const healAmount = roll.total;
    
    // Consume the resource
    CHARACTER_DATA.uses_second_wind--;
    
    // Add the health
    let currentHp = parseInt(ELEMENTS.currentHpInput.value, 10);
    const maxHp = parseInt(ELEMENTS.maxHpSpan.textContent, 10);
    currentHp = Math.min(currentHp + healAmount, maxHp); // Don't overheal
    
    CHARACTER_DATA.hp = currentHp;
    
    // Update UI and save
    ELEMENTS.currentHpInput.value = currentHp;
    ELEMENTS.secondWindUses.textContent = CHARACTER_DATA.uses_second_wind;
    updateResourceButtonStates(); // Disables button if uses hit 0
    saveCharacterData();
    
    const resultText = `${rollName}: Healed ${healAmount} HP [${roll.rollText}]`;
    displayRoll(ELEMENTS.actionRollDisplay, resultText, false, false, card);
}

/**
 * Handles "Action Surge" ability.
 * Consumes a use and updates the UI.
 */
function useActionSurge(button, card) {
    if (CHARACTER_DATA.uses_action_surge <= 0) {
        displayRoll(ELEMENTS.actionRollDisplay, "No uses of Action Surge remaining.", false, false, card);
        return;
    }
    
    // Consume the resource
    consumeResource('action_surge', ELEMENTS.actionSurgeUses, button);
    
    const resultText = `Action Surge used! You gain one additional action.`;
    displayRoll(ELEMENTS.actionRollDisplay, resultText, false, false, card);
}

/**
 * --- GENERIC RESOURCE HANDLER ---
 * Consumes a resource, updates its text, disables the button, and saves.
 */
function consumeResource(resourceName, textElement, buttonElement) {
    if (CHARACTER_DATA[`uses_${resourceName}`] > 0) {
        CHARACTER_DATA[`uses_${resourceName}`]--;
        
        textElement.textContent = CHARACTER_DATA[`uses_${resourceName}`];
        updateResourceButtonStates(); // Disables button if uses hit 0
        saveCharacterData();
        
        return true; // Successfully consumed
    }
    return false; // No uses left
}

/**
 * Handles "Cloud Rune" ability.
 * Consumes a use and updates the UI.
 */
function useCloudRune(button, card) {
    if (CHARACTER_DATA.uses_cloud_rune <= 0) {
        displayRoll(ELEMENTS.actionRollDisplay, "No uses of Cloud Rune remaining.", false, false, card);
        return;
    }
    
    // Consume the resource
    consumeResource('cloud_rune', ELEMENTS.cloudRuneUses, button);
    
    const resultText = `Cloud Rune used! You can use your reaction to redirect an attack.`;
    displayRoll(ELEMENTS.actionRollDisplay, resultText, false, false, card);
}

/**
 * Handles "Tactical Mind" ability.
 * Rolls a d10, consumes a use (from Second Wind), and updates the UI.
 */
function useTacticalMind(button, card) {
    // Tactical Mind uses Second Wind charges
    if (CHARACTER_DATA.uses_second_wind <= 0) {
        displayRoll(ELEMENTS.actionRollDisplay, "No uses of Second Wind remaining for Tactical Mind.", false, false, card);
        return;
    }
    
    const rollString = button.dataset.roll; // "1d10"
    const rollName = button.dataset.rollName;
    
    const roll = rollDiceString(rollString);
    const bonus = roll.total;

    // Consume the resource (from Second Wind)
    // Note: The logic says the use is only expended on a success. We'll
    // consume it here and let the user track the success.
    // To match the original file, we will also consume a "tactical_mind" use.
    consumeResource('second_wind', ELEMENTS.secondWindUses, ELEMENTS.rollSecondWind);
    consumeResource('tactical_mind', ELEMENTS.tacticalMindUses, button);

    const resultText = `${rollName}: Add +${bonus} to your failed ability check. [${roll.rollText}]`;
    displayRoll(ELEMENTS.actionRollDisplay, resultText, false, false, card);
}

/**
 * Activates or deactivates "Giant's Might".
 * Consumes a use on activation.
 */
function toggleGiantsMight(activate) {
    if (activate) {
        if (CHARACTER_DATA.uses_giants_might <= 0) {
            displayRoll(ELEMENTS.actionRollDisplay, "No uses of Giant's Might remaining.", false, false, ELEMENTS.giantsMightCard);
            return;
        }
        
        // Consume resource and activate
        if (consumeResource('giants_might', ELEMENTS.giantsMightUses, ELEMENTS.activateGiantsMight)) {
            CHARACTER_DATA.status_giants_might = true;
            updateGiantsMightStatus(true);
            saveCharacterData();
            displayRoll(ELEMENTS.actionRollDisplay, "Giant's Might activated!", false, false, ELEMENTS.giantsMightCard);
        }
    } else {
        // Deactivate
        CHARACTER_DATA.status_giants_might = false;
        updateGiantsMightStatus(false);
        saveCharacterData();
        displayRoll(ELEMENTS.actionRollDisplay, "Giant's Might deactivated.", false, false, ELEMENTS.giantsMightCard);
    }
}

/**
 * Updates the visual state of the Giant's Might card
 */
function updateGiantsMightStatus(isActive) {
    CHARACTER_DATA.status_giants_might = isActive;
    
    if (isActive) {
        ELEMENTS.giantsMightStatus.textContent = "Active";
        ELEMENTS.giantsMightStatus.classList.remove('bg-gray-700', 'text-gray-300');
        ELEMENTS.giantsMightStatus.classList.add('bg-green-600', 'text-white');
        ELEMENTS.activateGiantsMight.classList.add('hidden');
        ELEMENTS.deactivateGiantsMight.classList.remove('hidden');
    } else {
        ELEMENTS.giantsMightStatus.textContent = "Inactive";
        ELEMENTS.giantsMightStatus.classList.add('bg-gray-700', 'text-gray-300');
        ELEMENTS.giantsMightStatus.classList.remove('bg-green-600', 'text-white');
        ELEMENTS.activateGiantsMight.classList.remove('hidden');
        ELEMENTS.deactivateGiantsMight.classList.add('hidden');
    }
    
    // Update save throw bonuses to show (Adv)
    updateSaveBonusDisplay();
}

// --- HP & REST LOGIC ---

/**
 * Modifies the character's current HP by a given amount.
 */
function modifyHp(amount) {
    let currentHp = parseInt(ELEMENTS.currentHpInput.value, 10);
    const maxHp = parseInt(ELEMENTS.maxHpSpan.textContent, 10);
    
    currentHp += amount;
    currentHp = Math.max(0, Math.min(currentHp, maxHp)); // Clamp between 0 and maxHp
    
    ELEMENTS.currentHpInput.value = currentHp;
    CHARACTER_DATA.hp = currentHp;
    saveCharacterData();
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
    
    saveCharacterData();
}

/**
 * Performs a Long Rest.
 * Resets HP, all resources, and deactivates Giant's Might.
 */
function handleLongRest() {
    console.log("Performing Long Rest...");
    
    // Reset HP to max
    const maxHp = parseInt(ELEMENTS.maxHpSpan.textContent, 10);
    CHARACTER_DATA.hp = maxHp;
    CHARACTER_DATA.temp_hp = 0;

    // Reset all resources
    CHARACTER_DATA.uses_second_wind = 3;
    CHARACTER_DATA.uses_action_surge = 1;
    CHARACTER_DATA.uses_giants_might = 2;
    CHARACTER_DATA.uses_fire_rune = 1;
    CHARACTER_DATA.uses_cloud_rune = 1;
    CHARACTER_DATA.uses_tactical_mind = 3;
    
    // Deactivate statuses
    CHARACTER_DATA.status_giants_might = false;

    // Save and update the entire UI
    saveCharacterData();
    updateUiFromData();
    
    alert("Long Rest complete! HP and all resources have been restored.");
}

/**
 * Performs a Short Rest.
 * Resets Action Surge and Cloud Rune.
 */
function handleShortRest() {
    console.log("Performing Short Rest...");

    // Reset short rest resources
    CHARACTER_DATA.uses_action_surge = 1;
    CHARACTER_DATA.uses_cloud_rune = 1;
    
    // Save and update the entire UI
    saveCharacterData();
    updateUiFromData();

    alert("Short Rest complete! Action Surge and Cloud Rune have been restored.");
}

// --- INVENTORY LOGIC (Full Restoration) ---

/**
 * Generates a unique ID for a new inventory item.
 */
function generateItemId() {
    return 'item-' + Date.now() + Math.floor(Math.random() * 1000);
}

function handleInventoryFormChange(selected) {
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

function addNewWeapon() {
    const inputs = ELEMENTS.weaponFormInputs;
    if (!inputs.name.value || !inputs.damage.value) {
        alert("Please enter a name and damage string for the weapon.");
        return;
    }

    const newWeapon = {
        id: generateItemId(),
        name: inputs.name.value,
        type: "Weapon",
        equipped: true,
        proficient: inputs.proficiency.value === "Yes",
        attackType: inputs.attackType.value,
        damage: inputs.damage.value,
        damageType: inputs.damageType.value,
        reach: parseInt(inputs.reach.value, 10) || 5,
        weight: parseInt(inputs.weight.value, 10) || 0,
        cost: parseInt(inputs.cost.value, 10) || 0,
        properties: inputs.properties.value,
        notes: inputs.notes.value
    };

    CHARACTER_DATA.inventory.push(newWeapon);
    renderInventory();
    saveCharacterData();
    alert(`Weapon "${newWeapon.name}" added and equipped!`);
}

function addNewArmor() {
    const inputs = ELEMENTS.armorFormInputs;
    if (!inputs.name.value || !inputs.ac.value) {
        alert("Please enter a name and base AC for the armor.");
        return;
    }

    const newArmor = {
        id: generateItemId(),
        name: inputs.name.value,
        type: "Armor",
        equipped: true,
        armorType: inputs.type.value,
        baseAC: parseInt(inputs.ac.value, 10) || 10,
        maxDex: parseInt(inputs.maxDex.value, 10) || 0,
        isProficient: inputs.isProficient.value === "Yes",
        stealthDisadvantage: inputs.stealthDisadvantage.value === "Yes",
        weight: parseInt(inputs.weight.value, 10) || 0,
        cost: parseInt(inputs.cost.value, 10) || 0,
        notes: inputs.notes.value
    };

    CHARACTER_DATA.inventory.push(newArmor);
    renderInventory();
    saveCharacterData();
    alert(`Armor "${newArmor.name}" added and equipped!`);
}

function deleteItem(itemId) {
    if (confirm("Are you sure you want to delete this item?")) {
        CHARACTER_DATA.inventory = CHARACTER_DATA.inventory.filter(item => item.id !== itemId);
        renderInventory();
        saveCharacterData();
        updateEquippedActions();
    }
}

function toggleEquipItem(itemId) {
    const item = CHARACTER_DATA.inventory.find(i => i.id === itemId);
    if (item) {
        // Toggle the equipped status
        item.equipped = !item.equipped;
        
        // Handle armor exclusivity: unequip other armor of the same type
        if (item.equipped && item.type === 'Armor') {
            CHARACTER_DATA.inventory.forEach(otherItem => {
                if (otherItem.id !== itemId && otherItem.type === 'Armor' && otherItem.equipped) {
                    otherItem.equipped = false;
                }
            });
        }
        
        renderInventory();
        saveCharacterData();
        updateEquippedActions();
    }
}

function renderInventory() {
    const container = ELEMENTS.inventoryListContainer;
    container.innerHTML = '';
    
    if (CHARACTER_DATA.inventory.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Inventory is empty.</p>';
        return;
    }

    CHARACTER_DATA.inventory.forEach(item => {
        let details = '';
        if (item.type === 'Weapon') {
            details = `${item.damage} ${item.damageType} | ${item.properties}`;
        } else if (item.type === 'Armor') {
            details = `AC ${item.baseAC} | ${item.armorType} | Weight: ${item.weight} lb.`;
        } else {
             details = `Cost: ${item.cost} gp | Weight: ${item.weight} lb.`;
        }
        
        const equippedClass = item.equipped ? 'bg-yellow-800/20 border-yellow-700' : 'bg-gray-900 border-gray-700';
        const buttonText = item.equipped ? 'UNEQUIP' : 'EQUIP';

        const itemHtml = `
            <div id="${item.id}" class="inventory-item ${equippedClass} rounded-lg p-4 shadow-md flex justify-between items-center space-x-4">
                <div class="flex-grow">
                    <h4 class="text-xl font-bold ${item.equipped ? 'text-yellow-300' : 'text-white'}">${item.name}</h4>
                    <p class="text-sm text-gray-400">${details}</p>
                </div>
                <div class="flex space-x-2 flex-shrink-0">
                    <button class="action-roll-button inventory-equip-button bg-blue-600 hover:bg-blue-700 border-blue-500" data-item-id="${item.id}">
                        ${buttonText}
                    </button>
                    <button class="action-roll-button inventory-delete-button bg-red-600 hover:bg-red-700 border-red-500" data-item-id="${item.id}">
                        DELETE
                    </button>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', itemHtml);
    });
}

function updateEquippedActions() {
    // Logic to update the Actions page based on equipped items would go here.
    // E.g., showing/hiding specific weapon attack cards.
    // Placeholder to keep the function structure correct:
    console.log("Updating Equipped Actions (Placeholder)");
}

// --- COINAGE LOGIC (Full Restoration) ---

function updateCoinUi() {
    ELEMENTS.coin.pp_display.textContent = CHARACTER_DATA.coin.pp;
    ELEMENTS.coin.gp_display.textContent = CHARACTER_DATA.coin.gp;
    ELEMENTS.coin.ep_display.textContent = CHARACTER_DATA.coin.ep;
    ELEMENTS.coin.sp_display.textContent = CHARACTER_DATA.coin.sp;
    ELEMENTS.coin.cp_display.textContent = CHARACTER_DATA.coin.cp;
}

function clearCoinInputs() {
    ELEMENTS.coin.pp_input.value = '0';
    ELEMENTS.coin.gp_input.value = '0';
    ELEMENTS.coin.ep_input.value = '0';
    ELEMENTS.coin.sp_input.value = '0';
    ELEMENTS.coin.cp_input.value = '0';
}

function modifyCoin(action) {
    const factor = (action === 'add') ? 1 : -1;

    const pp = parseInt(ELEMENTS.coin.pp_input.value, 10) || 0;
    const gp = parseInt(ELEMENTS.coin.gp_input.value, 10) || 0;
    const ep = parseInt(ELEMENTS.coin.ep_input.value, 10) || 0;
    const sp = parseInt(ELEMENTS.coin.sp_input.value, 10) || 0;
    const cp = parseInt(ELEMENTS.coin.cp_input.value, 10) || 0;

    // Convert everything to Copper Pieces (cp) for easy math
    let totalCp = (pp * 1000) + (gp * 100) + (ep * 50) + (sp * 10) + cp;
    
    // Convert current stored coins to cp
    let currentTotalCp = (CHARACTER_DATA.coin.pp * 1000) + (CHARACTER_DATA.coin.gp * 100) + (CHARACTER_DATA.coin.ep * 50) + (CHARACTER_DATA.coin.sp * 10) + CHARACTER_DATA.coin.cp;
    
    // Calculate new total CP
    let newTotalCp = currentTotalCp + (totalCp * factor);
    
    // Prevent negative total
    newTotalCp = Math.max(0, newTotalCp);

    // Convert back to standard currency (Greedy conversion)
    CHARACTER_DATA.coin.pp = Math.floor(newTotalCp / 1000);
    newTotalCp %= 1000;

    CHARACTER_DATA.coin.gp = Math.floor(newTotalCp / 100);
    newTotalCp %= 100;
    
    // Ep is non-standard but often used. We'll use 50cp/10sp
    CHARACTER_DATA.coin.ep = 0; // Keeping it simple, avoid complex conversions/remainders for EP

    CHARACTER_DATA.coin.sp = Math.floor(newTotalCp / 10);
    newTotalCp %= 10;
    
    CHARACTER_DATA.coin.cp = newTotalCp;
    
    updateCoinUi();
    clearCoinInputs();
    saveCharacterData();
}

// --- PERSISTENCE & UI UPDATE (Full Restoration) ---

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
            Object.assign(CHARACTER_DATA, loadedData);
            console.log("Character data loaded.");
        } else {
            console.log("No saved data found. Using defaults.");
        }
    } catch (error) {
        console.error("Failed to load character data:", error);
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
    updateCoinUi();
    
    // Statuses
    updateGiantsMightStatus(CHARACTER_DATA.status_giants_might);

    // Inventory
    renderInventory();
    updateEquippedActions();
    
    // Resource Button States (e.g., disable if uses = 0)
    updateResourceButtonStates();
    
    console.log("UI update complete.");
}

/**
 * Disables/Enables resource buttons based on remaining uses.
 */
function updateResourceButtonStates() {
    ELEMENTS.rollSecondWind.disabled = CHARACTER_DATA.uses_second_wind <= 0;
    ELEMENTS.useActionSurge.disabled = CHARACTER_DATA.uses_action_surge <= 0;
    ELEMENTS.activateGiantsMight.disabled = CHARACTER_DATA.uses_giants_might <= 0;
    ELEMENTS.rollFireRuneDmg.disabled = CHARACTER_DATA.uses_fire_rune <= 0;
    ELEMENTS.useCloudRune.disabled = CHARACTER_DATA.uses_cloud_rune <= 0;
    ELEMENTS.rollTacticalMind.disabled = CHARACTER_DATA.uses_tactical_mind <= 0;
}

/**
 * Updates save throw displays for dynamic effects like Giant's Might.
 */
function updateSaveBonusDisplay() {
    // Only used to trigger visual refresh of save bonuses to show (Adv) on STR/CON
    ELEMENTS.savesContainer.querySelectorAll('.save-rollable').forEach(saveElement => {
        const stat = saveElement.dataset.stat;
        const isAdvantage = CHARACTER_DATA.status_giants_might && (stat === "STR" || stat === "CON");
        
        saveElement.style.border = isAdvantage ? '1px solid #48bb78' : '1px solid #4a5568';
        saveElement.style.backgroundColor = isAdvantage ? '#42412d' : '#2d3748';
    });
}

/**
 * Initializes the persistence layer: loads data, then updates the UI.
 */
function initializePersistence() {
    loadCharacterData();
    updateUiFromData();
}

// --- APP ENTRY POINT ---

// Wait for the DOM to be fully loaded before running the app.
document.addEventListener('DOMContentLoaded', onDomLoaded);