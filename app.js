/**
 * ==============================================================================================
 * D&D Character Sheet - app.js
 * Externalized JavaScript Logic for a Rune Knight Character Sheet
 * ----------------------------------------------------------------------------------------------
 * This script handles all character sheet functionality, including:
 * 1. Data Persistence (Firebase or LocalStorage fallback).
 * 2. Character state management (HP, uses, equipped items).
 * 3. Dynamic UI rendering (Inventory, Actions list).
 * 4. Dice Rolling and calculation utilities.
 * 5. Event listeners for user interaction.
 * ==============================================================================================
 */

// --- 1. FIREBASE/PERSISTENCE SETUP (Only required if using Firebase) ---

// NOTE: Since we are splitting the file, if Firebase was used, the necessary
// Firebase SDK import and initialization code would go here.
// For now, we will assume a standard non-module setup, or that the user will
// provide the Firebase credentials later. The LocalStorage logic remains below.

// Placeholder for Firebase initialization (must be imported as a module in a real scenario)
// import { initializeApp } from "firebase/app";
// import { getDatabase, ref, get, set, onValue } from "firebase/database";

const FIREBASE_CONFIG = {
    // Add your Firebase configuration keys here
    // Example: apiKey: "...", authDomain: "...", databaseURL: "..."
};

let db = null; // Placeholder for the Firebase Database instance
let isFirebaseInitialized = false;
const DATA_KEY = "thangrim_ironfist_data"; // LocalStorage and Firebase key

// --- 2. CORE CHARACTER DATA STRUCTURES ---

// Base Character Stats and Info
const BASE_STATS = {
    STR: 20,
    DEX: 11,
    CON: 14,
    INT: 12,
    WIS: 11,
    CHA: 9,
    PROF_BONUS: 2,
    LEVEL: 4,
    MAX_HP: 34,
    AC_BASE: 10,
    RUNE_DC: 15, // 8 + PROF_BONUS + CON_MOD (8 + 2 + 3, assuming CON 16+ for a level 4 char with CON 14, but using 15 from HTML)
};

// Initial State (Modified by persistence layer on load)
let characterState = {
    currentHP: BASE_STATS.MAX_HP,
    tempHP: 0,
    // Resource Uses
    giantsMightUses: 2,
    secondWindUses: 1,
    actionSurgeUses: 1,
    fireRuneUses: 1,
    cloudRuneUses: 1,
    // Statuses
    isGiantsMightActive: false,
    // Inventory
    coins: {
        platinum: 0,
        gold: 150,
        electrum: 0,
        silver: 250,
        copper: 500,
    },
    inventory: [
        {
            id: 'warhammer-1',
            type: 'weapon',
            name: 'Warhammer of the Forge',
            damageDice: '1d10',
            damageType: 'Bludgeoning',
            properties: 'Versatile (1d10), Master (Push)',
            attackStat: 'STR',
            equipped: true,
        },
        {
            id: 'chain-mail-1',
            type: 'armor',
            name: 'Dwarven Chain Mail',
            baseAC: 16,
            modifier: 'none', // none, +DEX, +2 Max
            armorType: 'Heavy', // Heavy, Medium, Light
            equipped: true,
        },
        {
            id: 'potion-1',
            type: 'item',
            name: 'Potion of Healing (Greater)',
            description: 'Restores 4d4 + 4 HP.',
            equipped: false,
        },
    ],
    // Text Areas
    notes: "Campaign started in Silvermere...",
    originStory: "Thangrim was the youngest son of a smith who found his path not in the forge, but in protecting his clan through runic magic and brute force. He recently left his mountain home to seek the lost runes of his ancestors.",
};

// --- 3. UI ELEMENT REFERENCES ---

const ELEMENTS = {
    // Top Bar
    acDisplay: document.getElementById('ac-display'),
    currentHpInput: document.getElementById('current-hp'),
    tempHpInput: document.getElementById('temp-hp'),
    hpPlusButton: document.getElementById('hp-plus-button'),
    hpMinusButton: document.getElementById('hp-minus-button'),
    longRestButton: document.getElementById('long-rest-button'),
    shortRestButton: document.getElementById('short-rest-button'),
    
    // Pages
    mainContent: document.getElementById('main-content'),
    splashScreen: document.getElementById('splash-screen'),
    navBar: document.getElementById('nav-bar'),
    
    // Main Page Rolls
    skillRollDisplay: document.getElementById('skill-roll-display'),
    saveRollDisplay: document.getElementById('save-roll-display'),
    
    // Action Page
    actionsList: document.getElementById('actions-list'),
    bonusActionsList: document.getElementById('bonus-actions-list'),
    actionRollDisplay: document.getElementById('action-roll-display'),
    
    // Action Resource Buttons
    giantsMightUsesSpan: document.getElementById('giants-might-uses'),
    giantsMightStatusSpan: document.getElementById('giants-might-status'),
    activateGiantsMightButton: document.getElementById('activate-giants-might'),
    deactivateGiantsMightButton: document.getElementById('deactivate-giants-might'),
    secondWindUsesSpan: document.getElementById('second-wind-uses'),
    secondWindButton: document.getElementById('second-wind-button'),
    actionSurgeUsesSpan: document.getElementById('action-surge-uses'),
    actionSurgeButton: document.getElementById('action-surge-button'),
    fireRuneUsesSpan: document.getElementById('fire-rune-uses'),
    fireRuneButton: document.getElementById('fire-rune-button'),
    cloudRuneUsesSpan: document.getElementById('cloud-rune-uses'),
    cloudRuneButton: document.getElementById('cloud-rune-button'),
    
    // Inventory Page
    addWeaponForm: document.getElementById('add-weapon-form'),
    addArmorForm: document.getElementById('add-armor-form'),
    equippedList: document.getElementById('equipped-list'),
    unequippedList: document.getElementById('unequipped-list'),
    
    // Coinage
    platinumInput: document.getElementById('platinum-amount'),
    goldInput: document.getElementById('gold-amount'),
    electrumInput: document.getElementById('electrum-amount'),
    silverInput: document.getElementById('silver-amount'),
    copperInput: document.getElementById('copper-amount'),
    
    // Background/Notes
    notesTextarea: document.getElementById('notes-textarea'),
    originStoryTextarea: document.getElementById('origin-story-textarea'),
    
    // Persistence Status
    persistenceMessage: document.getElementById('persistence-message'),
};

// --- 4. UTILITY FUNCTIONS ---

/**
 * Calculates the modifier from a base stat score.
 * @param {number} score 
 * @returns {number}
 */
const getModifier = (score) => Math.floor((score - 10) / 2);

/**
 * Calculates a random integer between min (inclusive) and max (inclusive).
 * @param {number} min 
 * @param {number} max 
 * @returns {number}
 */
const rollDie = (max) => Math.floor(Math.random() * max) + 1;

/**
 * Calculates the total AC based on current state.
 * @returns {number}
 */
const calculateAC = () => {
    // Start with base AC
    let totalAC = BASE_STATS.AC_BASE;
    let hasArmor = false;
    let armorAc = 0;
    let dexMod = getModifier(BASE_STATS.DEX);

    // Find the equipped armor
    const equippedArmor = characterState.inventory.find(item => item.type === 'armor' && item.equipped);

    if (equippedArmor) {
        hasArmor = true;
        armorAc = equippedArmor.baseAC;

        switch (equippedArmor.armorType.toLowerCase()) {
            case 'light':
                // AC = Base AC + Dex Mod
                totalAC = armorAc + dexMod;
                break;
            case 'medium':
                // AC = Base AC + min(Dex Mod, 2)
                totalAC = armorAc + Math.min(dexMod, 2);
                break;
            case 'heavy':
                // AC = Base AC (Heavy armor ignores Dex Mod)
                totalAC = armorAc;
                break;
            default:
                // Fallback for custom or no armor type
                totalAC = armorAc;
                break;
        }
    } else {
        // Unarmored AC: 10 + Dex Mod
        totalAC = 10 + dexMod;
    }

    // Add Shield AC if equipped (assuming a shield gives +2 AC)
    const hasShield = characterState.inventory.some(item => item.type === 'shield' && item.equipped);
    if (hasShield) {
        totalAC += 2;
    }
    
    return totalAC;
};

/**
 * Rolls a dice string (e.g., '1d8', '2d6+3', '1d10').
 * @param {string} diceString 
 * @returns {object} {total: number, rolls: number[], mod: number}
 */
const performRoll = (diceString) => {
    let total = 0;
    let rolls = [];
    let parts = diceString.toLowerCase().split('+');
    let base = parts[0];
    let mod = parts.length > 1 ? parseInt(parts[1]) : 0;

    if (base.includes('d')) {
        let [numDice, dieSize] = base.split('d').map(Number);
        
        // Handle no leading number (e.g., 'd6' or 'd20')
        if (isNaN(numDice)) {
            numDice = 1;
        }

        for (let i = 0; i < numDice; i++) {
            let roll = rollDie(dieSize);
            rolls.push(roll);
            total += roll;
        }
    } else {
        // Static value (e.g., '5')
        total = parseInt(base);
        mod = 0; // Static rolls shouldn't have mods applied by the roller
        rolls = [total];
    }
    
    total += mod;

    return { total, rolls, mod };
};

/**
 * Handles all skill and save rolling logic (D20 rolls).
 * @param {string} rollName 
 * @param {string} modifierString 
 * @param {string} rollType 
 * @param {HTMLElement} displayElement 
 */
const handleD20Roll = (rollName, modifierString, rollType, displayElement) => {
    let modifier = parseInt(modifierString);
    let rolls = [rollDie(20)];
    let result = rolls[0] + modifier;
    let rollText = `${rollName}: `;
    let rollDescription = `${rolls[0]} + ${modifier} = `;

    if (rollType === 'advantage') {
        let roll2 = rollDie(20);
        rolls.push(roll2);
        let bestRoll = Math.max(...rolls);
        result = bestRoll + modifier;
        rollDescription = `[${rolls.join(', ')}] (Adv) + ${modifier} = `;
    } else if (rollType === 'disadvantage') {
        let roll2 = rollDie(20);
        rolls.push(roll2);
        let worstRoll = Math.min(...rolls);
        result = worstRoll + modifier;
        rollDescription = `[${rolls.join(', ')}] (Dis) + ${modifier} = `;
    }
    
    rollText += `<span class="text-white font-bold">${result}</span> (${rollDescription} <span class="font-bold">${result}</span>)`;

    // Apply the Tactical Mind check for Saves (DC 10 WIS Save)
    if (rollName.includes('Save')) {
        const wisMod = getModifier(BASE_STATS.WIS);
        const tacticalRoll = rollDie(20);
        const tacticalResult = tacticalRoll + wisMod;
        const tacticalSuccess = tacticalResult >= 10;
        
        let tacticalMsg = `Tactical Mind Check: ${tacticalRoll} + ${wisMod} = ${tacticalResult}. `;
        
        if (tacticalSuccess) {
            tacticalMsg += `<span class="text-green-400 font-bold">Success!</span>`;
        } else {
            tacticalMsg += `<span class="text-red-400 font-bold">Fail.</span>`;
        }
        
        // Append Tactical Mind check result to the display (non-breaking space)
        rollText += `<br class="sm:hidden"> &nbsp; <span class="text-gray-500 text-xs">(TM: ${tacticalResult})</span>`;
        
        displayElement.innerHTML = rollText;

        // Display full roll and check details in console for clarity
        console.log(`--- ${rollName} Roll ---`);
        console.log(`Rolls: ${rolls.join(', ')}`);
        console.log(`Modifier: ${modifier}`);
        console.log(`Final Result: ${result}`);
        console.log(`Tactical Mind Roll: ${tacticalResult} (DC 10) - ${tacticalSuccess ? 'SUCCESS' : 'FAIL'}`);

    } else {
        displayElement.innerHTML = rollText;
    }
    
};

/**
 * A simple debouncing function to limit the rate of function calls.
 * Used for persistence of large text areas.
 * @param {function} func 
 * @param {number} delay 
 * @returns {function}
 */
const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(null, args);
        }, delay);
    };
};

// --- 5. DATA PERSISTENCE HANDLERS (CRITICAL) ---

/**
 * Updates the global character state and saves it.
 * @param {string} key 
 * @param {*} value 
 */
const updateAndSaveState = (key, value) => {
    // Handle nested keys (e.g., 'coins.gold')
    const keys = key.split('.');
    let target = characterState;

    for (let i = 0; i < keys.length - 1; i++) {
        target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = value;

    // Save the entire state
    saveCharacterData();
};

/**
 * Saves the current characterState to the persistence layer (Firebase or LocalStorage).
 */
const saveCharacterData = () => {
    try {
        if (isFirebaseInitialized) {
            // FIREBASE SAVE LOGIC
            // set(ref(db, DATA_KEY), characterState);
            ELEMENTS.persistenceMessage.innerHTML = '<span class="text-green-400 font-bold">Data Saved (Firebase Mock)</span>';
        } else {
            // LOCALSTORAGE SAVE LOGIC
            localStorage.setItem(DATA_KEY, JSON.stringify(characterState));
            ELEMENTS.persistenceMessage.innerHTML = '<span class="text-green-400">Data Saved (Local)</span>';
        }
        
    } catch (e) {
        console.error("Failed to save character data:", e);
        ELEMENTS.persistenceMessage.innerHTML = '<span class="text-red-400">Save Failed! (Check Console)</span>';
    }
    // Re-render anything that might have changed (e.g., AC, inventory)
    renderAllDynamicContent(); 
};

/**
 * Loads the characterState from the persistence layer.
 */
const loadCharacterData = () => {
    // 1. Try LocalStorage
    const storedData = localStorage.getItem(DATA_KEY);
    if (storedData) {
        characterState = JSON.parse(storedData);
        console.log("Character data loaded from LocalStorage.");
        ELEMENTS.persistenceMessage.innerHTML = '<span class="text-yellow-400">Using LocalStorage</span>';
        return true;
    }
    
    // 2. If nothing is found, use the initial state and save it
    saveCharacterData(); 
    return false;
};

/**
 * Placeholder for persistence initialization.
 */
const initializePersistence = () => {
    // In a full implementation, this would try to init Firebase first,
    // then fall back to loadCharacterData() if Firebase fails.
    
    // For now, load/init LocalStorage immediately.
    loadCharacterData();
};

/**
 * Resets all resource uses to their maximum values (for Short/Long Rest).
 * @param {string} restType 'short' or 'long'
 */
const resetResources = (restType) => {
    // Long Rest resets everything
    if (restType === 'long') {
        characterState.currentHP = BASE_STATS.MAX_HP;
        characterState.tempHP = 0;
        updateAndSaveState('currentHP', characterState.currentHP);
        updateAndSaveState('tempHP', characterState.tempHP);
        updateAndSaveState('isGiantsMightActive', false);
        // Fallthrough to Short Rest resets
    }

    // Short Rest resets
    if (restType === 'short' || restType === 'long') {
        updateAndSaveState('secondWindUses', 1);
        updateAndSaveState('actionSurgeUses', 1);
        updateAndSaveState('fireRuneUses', 1);
        updateAndSaveState('cloudRuneUses', 1);
        updateAndSaveState('giantsMightUses', 2);
    }
};


// --- 6. DATA RENDERING (Updating the UI to match characterState) ---

/**
 * Renders all dynamic UI elements based on characterState.
 */
const renderAllDynamicContent = () => {
    renderHP();
    renderAC();
    renderCoinage();
    renderInventory();
    renderActions();
    renderResources();
    renderTextAreas();
};

/**
 * Renders HP and Temp HP inputs.
 */
const renderHP = () => {
    ELEMENTS.currentHpInput.value = characterState.currentHP;
    ELEMENTS.tempHpInput.value = characterState.tempHP;
    // Max HP is static but good practice to include
    document.getElementById('max-hp').textContent = BASE_STATS.MAX_HP;
};

/**
 * Renders the calculated AC.
 */
const renderAC = () => {
    const ac = calculateAC();
    ELEMENTS.acDisplay.textContent = ac;
};

/**
 * Renders the coin amounts.
 */
const renderCoinage = () => {
    ELEMENTS.platinumInput.value = characterState.coins.platinum;
    ELEMENTS.goldInput.value = characterState.coins.gold;
    ELEMENTS.electrumInput.value = characterState.coins.electrum;
    ELEMENTS.silverInput.value = characterState.coins.silver;
    ELEMENTS.copperInput.value = characterState.coins.copper;
};

/**
 * Renders the state of resource buttons and spans.
 */
const renderResources = () => {
    // Giant's Might
    ELEMENTS.giantsMightUsesSpan.textContent = characterState.giantsMightUses;
    ELEMENTS.secondWindUsesSpan.textContent = characterState.secondWindUses;
    ELEMENTS.actionSurgeUsesSpan.textContent = characterState.actionSurgeUses;
    ELEMENTS.fireRuneUsesSpan.textContent = characterState.fireRuneUses;
    ELEMENTS.cloudRuneUsesSpan.textContent = characterState.cloudRuneUses;

    // Enable/Disable Buttons
    ELEMENTS.giantsMightUses > 0 ? ELEMENTS.activateGiantsMightButton.removeAttribute('disabled') : ELEMENTS.activateGiantsMightButton.setAttribute('disabled', 'true');
    ELEMENTS.secondWindUses > 0 ? ELEMENTS.secondWindButton.removeAttribute('disabled') : ELEMENTS.secondWindButton.setAttribute('disabled', 'true');
    ELEMENTS.actionSurgeUses > 0 ? ELEMENTS.actionSurgeButton.removeAttribute('disabled') : ELEMENTS.actionSurgeButton.setAttribute('disabled', 'true');
    ELEMENTS.fireRuneUses > 0 ? ELEMENTS.fireRuneButton.removeAttribute('disabled') : ELEMENTS.fireRuneButton.setAttribute('disabled', 'true');
    ELEMENTS.cloudRuneUses > 0 ? ELEMENTS.cloudRuneButton.removeAttribute('disabled') : ELEMENTS.cloudRuneButton.setAttribute('disabled', 'true');

    // Status text and deactivate button visibility
    if (characterState.isGiantsMightActive) {
        ELEMENTS.giantsMightStatusSpan.textContent = 'Active (1d6 extra dmg)';
        ELEMENTS.giantsMightStatusSpan.classList.remove('bg-gray-700', 'text-gray-300');
        ELEMENTS.giantsMightStatusSpan.classList.add('bg-yellow-600', 'text-white');
        ELEMENTS.activateGiantsMightButton.setAttribute('disabled', 'true');
        ELEMENTS.deactivateGiantsMightButton.classList.remove('hidden');
    } else {
        ELEMENTS.giantsMightStatusSpan.textContent = 'Inactive';
        ELEMENTS.giantsMightStatusSpan.classList.remove('bg-yellow-600', 'text-white');
        ELEMENTS.giantsMightStatusSpan.classList.add('bg-gray-700', 'text-gray-300');
        ELEMENTS.deactivateGiantsMightButton.classList.add('hidden');
        if (characterState.giantsMightUses > 0) {
             ELEMENTS.activateGiantsMightButton.removeAttribute('disabled');
        }
    }
};

/**
 * Renders the content of the two large text areas.
 */
const renderTextAreas = () => {
    ELEMENTS.notesTextarea.value = characterState.notes;
    ELEMENTS.originStoryTextarea.value = characterState.originStory;
};


// --- 7. INVENTORY RENDERING & UTILITIES ---

/**
 * Generates the HTML for a single inventory item card.
 * @param {object} item 
 * @returns {string} HTML string
 */
const generateInventoryCard = (item) => {
    const isEquipped = item.equipped;
    const isWeaponOrArmor = item.type === 'weapon' || item.type === 'armor';
    const equipButtonText = isEquipped ? 'Unequip' : 'Equip';
    const equipButtonClass = isEquipped ? 'unequip-button' : 'equip-button';
    const damageOrAC = item.type === 'weapon' 
        ? `${item.damageDice} ${item.damageType}` 
        : (item.type === 'armor' ? `AC ${item.baseAC} (${item.modifier})` : 'N/A');
    
    // Add custom info for non-weapon/non-armor items
    let itemDetails = '';
    if (item.type === 'item') {
        itemDetails = `<p class="text-sm text-gray-400">${item.description}</p>`;
    } else if (isWeaponOrArmor) {
        itemDetails = `
            <div class="grid grid-cols-2 gap-2 text-sm text-gray-400">
                ${item.type === 'weapon' ? `<div><span class="font-semibold">Damage:</span> ${damageOrAC}</div>` : `<div><span class="font-semibold">AC:</span> ${damageOrAC}</div>`}
                ${item.type === 'weapon' ? `<div><span class="font-semibold">Stat:</span> ${item.attackStat}</div>` : `<div><span class="font-semibold">Type:</span> ${item.armorType}</div>`}
                ${item.properties ? `<div class="col-span-2"><span class="font-semibold">Props:</span> ${item.properties}</div>` : ''}
            </div>
        `;
    }

    return `
        <div class="inventory-item-card rounded-lg p-4 shadow-md flex justify-between items-center" data-item-id="${item.id}" data-item-type="${item.type}">
            <div class="flex-grow space-y-1">
                <h4 class="text-lg font-bold text-white">${item.name}</h4>
                ${itemDetails}
            </div>
            <div class="flex space-x-2 items-center flex-shrink-0 ml-4">
                ${isWeaponOrArmor ? `<button class="${equipButtonClass}" data-action="${isEquipped ? 'unequip' : 'equip'}" data-item-id="${item.id}">${equipButtonText}</button>` : ''}
                <button class="delete-button" data-action="delete" data-item-id="${item.id}" title="Delete Item">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        </div>
    `;
};

/**
 * Renders the entire inventory list, splitting items into equipped and unequipped.
 */
const renderInventory = () => {
    ELEMENTS.equippedList.innerHTML = '';
    ELEMENTS.unequippedList.innerHTML = '';
    
    let equippedHtml = '';
    let unequippedHtml = '';
    
    if (characterState.inventory.length === 0) {
        ELEMENTS.unequippedList.innerHTML = '<p class="text-gray-400 italic">No items found in inventory.</p>';
        return;
    }

    // Split items into equipped and unequipped lists
    characterState.inventory.forEach(item => {
        const cardHtml = generateInventoryCard(item);
        if (item.equipped) {
            equippedHtml += cardHtml;
        } else {
            unequippedHtml += cardHtml;
        }
    });

    // Populate the lists, ensuring they show a fallback message if empty
    ELEMENTS.equippedList.innerHTML = equippedHtml || '<p class="text-gray-400 italic">No equipment currently equipped.</p>';
    ELEMENTS.unequippedList.innerHTML = unequippedHtml || '<p class="text-gray-400 italic">All items are currently equipped.</p>';

    // Recalculate AC after rendering inventory
    renderAC();
};

/**
 * Adds a new item to the characterState.
 * @param {object} itemData 
 */
const addItem = (itemData) => {
    // Generate a unique ID (simple timestamp method)
    itemData.id = `${itemData.type}-${Date.now()}`;
    itemData.equipped = itemData.equipped || false; // Ensure it has a default equipped status
    
    // Add to state and save
    characterState.inventory.push(itemData);
    saveCharacterData();
    renderInventory();
};

/**
 * Deletes an item from the characterState.
 * @param {string} itemId 
 */
const deleteItem = (itemId) => {
    // Find index of item
    const itemIndex = characterState.inventory.findIndex(item => item.id === itemId);
    
    if (itemIndex !== -1) {
        const itemName = characterState.inventory[itemIndex].name;
        // Ask for confirmation
        if (confirm(`Are you sure you want to delete "${itemName}"?`)) {
            characterState.inventory.splice(itemIndex, 1);
            saveCharacterData();
            renderInventory();
            renderActions(); // Actions might change if a weapon was deleted
        }
    }
};

/**
 * ==============================================================================================
 * D&D Character Sheet - app.js (Chunk 2)
 * ==============================================================================================
 */

/**
 * Equips or Unequips an item, handling conflicts (e.g., only one armor equipped).
 * @param {string} itemId 
 * @param {boolean} equipStatus 
 */
const toggleEquipStatus = (itemId, equipStatus) => {
    const item = characterState.inventory.find(item => item.id === itemId);

    if (!item) return;

    // Special handling for Armor: Unequip all other armor of the same type first
    if (item.type === 'armor' && equipStatus === true) {
        characterState.inventory.forEach(otherItem => {
            if (otherItem.type === 'armor' && otherItem.id !== itemId) {
                otherItem.equipped = false;
            }
        });
    }

    // Special handling for Weapons: Unequip all other weapons if this one is equipped
    // NOTE: This can be expanded for dual-wielding, but for a single primary weapon, this is correct.
    if (item.type === 'weapon' && equipStatus === true) {
        characterState.inventory.forEach(otherItem => {
            if (otherItem.type === 'weapon' && otherItem.id !== itemId) {
                otherItem.equipped = false;
            }
        });
    }

    // Set the status of the target item
    item.equipped = equipStatus;
    
    saveCharacterData();
    renderInventory();
    renderActions(); // Need to re-render action list when weapons change
};


// --- 8. ACTION/WEAPON RENDERING & UTILITIES ---

/**
 * Renders the Actions page, generating weapon cards dynamically from equipped inventory.
 */
const renderActions = () => {
    // Clear the current dynamic list (keeping the static Unarmed Strike card)
    let dynamicWeaponsHtml = '';
    
    const equippedWeapons = characterState.inventory.filter(item => item.type === 'weapon' && item.equipped);
    
    if (equippedWeapons.length === 0) {
        // Hide the static Unarmed Strike card if there are no equipped weapons for simplicity
        // document.getElementById('unarmed-strike-card').classList.remove('hidden');
        document.getElementById('unarmed-strike-card').classList.remove('hidden'); 
    } else {
        document.getElementById('unarmed-strike-card').classList.add('hidden'); // Hide if weapons are equipped
    }

    equippedWeapons.forEach(weapon => {
        // Determine the attack modifier
        const stat = weapon.attackStat;
        const statScore = BASE_STATS[stat];
        const statMod = getModifier(statScore);
        const hitBonus = statMod + BASE_STATS.PROF_BONUS;
        
        // Calculate the base damage roll
        const { total: avgDamage, rolls: damageRolls, mod: damageMod } = performRoll(weapon.damageDice);
        const damageFormula = `${weapon.damageDice}+${statMod}`;
        const totalDamage = avgDamage + statMod; // This isn't strictly correct average, but gives a representative value
        
        // Handle Giant's Might bonus damage
        let giantsMightDmg = '';
        if (characterState.isGiantsMightActive) {
            giantsMightDmg = ` <span class="text-sm text-yellow-400">(+1d6 GM)</span>`;
        }

        // Generate the card HTML
        dynamicWeaponsHtml += `
            <div class="action-card bg-gray-900 rounded-lg p-4 border border-gray-700 shadow-md" data-weapon-id="${weapon.id}">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3">
                    <h4 class="text-xl font-bold text-white">${weapon.name}</h4>
                    <div class="flex space-x-2 mt-2 sm:mt-0">
                        <span class="text-xs font-semibold bg-gray-700 text-gray-300 px-2 py-1 rounded-full">${weapon.attackStat} Attack</span>
                        <span class="text-xs font-semibold bg-gray-700 text-gray-300 px-2 py-1 rounded-full">${weapon.damageType}</span>
                    </div>
                </div>

                <div class="flex flex-col sm:flex-row items-center gap-4 mb-3 text-center">
                    <div class="grid grid-cols-3 gap-4 flex-grow">
                        <div>
                            <div class="text-xs font-bold uppercase text-gray-400">Range</div>
                            <div class="text-lg font-semibold">5ft.</div>
                        </div>
                        <div>
                            <div class="text-xs font-bold uppercase text-gray-400">Hit / DC</div>
                            <div class="text-lg font-semibold text-yellow-300">+${hitBonus}</div>
                        </div>
                        <div>
                            <div class="text-xs font-bold uppercase text-gray-400">Damage</div>
                            <div class="text-lg font-semibold">${damageFormula}</div>
                        </div>
                    </div>
                    <div class="flex space-x-2 flex-shrink-0 mt-3 sm:mt-0">
                        <button class="action-roll-button" data-roll="1d20+${hitBonus}" data-roll-name="${weapon.name} Hit" data-roll-type="hit" data-weapon-dmg="${damageFormula}" data-giants-might="${characterState.isGiantsMightActive}" data-weapon-id="${weapon.id}">Roll Hit</button>
                        <button class="action-roll-button" data-roll="${damageFormula}" data-roll-name="${weapon.name} Dmg" data-roll-type="damage" data-giants-might="${characterState.isGiantsMightActive}" data-weapon-id="${weapon.id}">Roll Damage</button>
                    </div>
                </div>

                <div>
                    <div class="text-xs font-bold uppercase text-gray-400">Properties</div>
                    <p class="text-sm text-gray-300">${weapon.properties || 'None'}${giantsMightDmg}</p>
                </div>
            </div>
        `;
    });

    ELEMENTS.actionsList.innerHTML += dynamicWeaponsHtml;
};

/**
 * Handles the calculation and display of an action/weapon roll (Hit or Damage).
 * @param {object} button 
 */
const handleActionRoll = (button) => {
    const rollString = button.dataset.roll;
    const rollName = button.dataset.rollName;
    const rollType = button.dataset.rollType;
    const isGiantsMight = button.dataset.giantsMight === 'true';
    
    let rollDetails = performRoll(rollString);
    let displayMessage = '';
    
    // --- 1. Handle Attack Roll (Hit) ---
    if (rollType === 'hit') {
        const d20 = rollDetails.rolls[0];
        const total = rollDetails.total;
        
        displayMessage = `<span class="text-white font-bold">${rollName}: ${total}</span> (Rolled ${d20}, Mod +${rollDetails.mod})`;
        
        // --- Auto-Roll Damage on Hit ---
        // Get the damage formula from the button's data attribute
        const damageFormula = button.dataset.weaponDmg;
        const damageResult = calculateDamageRoll(damageFormula, isGiantsMight);
        
        displayMessage += `<br class="sm:hidden"> &nbsp; <span class="text-gray-500 text-xs">(Dmg: ${damageResult.total} [${damageResult.rolls.join('+')}]${damageResult.giantsMightRoll ? ` + ${damageResult.giantsMightRoll}` : ''} + ${damageResult.mod})</span>`;
    } 
    // --- 2. Handle Damage Roll ---
    else if (rollType === 'damage') {
        const damageResult = calculateDamageRoll(rollString, isGiantsMight);
        const gmText = damageResult.giantsMightRoll ? ` + ${damageResult.giantsMightRoll} (GM)` : '';
        
        displayMessage = `<span class="text-white font-bold">${rollName}: ${damageResult.total}</span> (Rolls: ${damageResult.baseRolls.join('+')} + ${damageResult.mod}${gmText})`;
    } 
    // --- 3. Handle Static/Other Rolls (e.g., Fire Rune DC) ---
    else if (rollType === 'static') {
         // Used for simple show damage on unarmed strike
         displayMessage = `<span class="text-white font-bold">${rollName}: ${rollDetails.total}</span> (Static Value)`;
    }
    
    ELEMENTS.actionRollDisplay.innerHTML = displayMessage;
};

/**
 * Calculates a damage roll, including special features like Great Weapon Fighting and Giant's Might.
 * @param {string} diceString - The base damage dice string (e.g., '1d10+5')
 * @param {boolean} isGiantsMight - Whether to add the 1d6 Giant's Might damage
 * @returns {object} {total: number, baseRolls: number[], mod: number, giantsMightRoll: number|null}
 */
const calculateDamageRoll = (diceString, isGiantsMight) => {
    let baseRolls = [];
    let giantsMightRoll = null;
    let total = 0;

    // --- 1. Separate Dice and Modifier ---
    let [dicePart, modPart] = diceString.toLowerCase().split('+').map(s => s.trim());
    const mod = parseInt(modPart) || 0;
    
    if (!dicePart.includes('d')) {
        // Static damage (e.g., 6 for Unarmed Strike)
        total = parseInt(dicePart) + mod;
        baseRolls = [parseInt(dicePart)];
    } else {
        // Dice damage (e.g., 1d10)
        let [numDice, dieSize] = dicePart.split('d').map(Number);
        if (isNaN(numDice)) numDice = 1;
        
        for (let i = 0; i < numDice; i++) {
            let roll = rollDie(dieSize);
            
            // Apply Great Weapon Fighting (Reroll 1s and 2s if weapon is Two-Handed/Versatile)
            // NOTE: Assuming the equipped weapon is a Great Weapon for Thangrim (Warhammer is Versatile(1d10))
            if (dieSize >= 6 && (roll === 1 || roll === 2)) {
                roll = rollDie(dieSize); // Reroll
                // console.log(`GWM Reroll: Used ${roll} after rerolling 1 or 2.`);
            }
            
            baseRolls.push(roll);
            total += roll;
        }
        
        total += mod;
    }
    
    // --- 2. Add Giant's Might Damage ---
    if (isGiantsMight) {
        giantsMightRoll = rollDie(6);
        total += giantsMightRoll;
    }
    
    return {
        total: total,
        baseRolls: baseRolls,
        mod: mod,
        giantsMightRoll: giantsMightRoll,
        rolls: baseRolls.concat(giantsMightRoll ? [giantsMightRoll] : []), // Combined rolls for display
    };
};

/**
 * Handles the specialized healing roll for Second Wind.
 * Formula: 1d10 + Fighter Level (4)
 */
const handleSecondWindRoll = () => {
    if (characterState.secondWindUses <= 0) return;
    
    const fighterLevel = BASE_STATS.LEVEL;
    const baseRoll = rollDie(10);
    const healingAmount = baseRoll + fighterLevel;
    
    // --- 1. Perform Tactical Mind Check (DC 10 WIS Save) ---
    const wisMod = getModifier(BASE_STATS.WIS);
    const tacticalRoll = rollDie(20);
    const tacticalResult = tacticalRoll + wisMod;
    const tacticalSuccess = tacticalResult >= 10;
    
    let rollDisplay = `<span class="text-white font-bold">Second Wind: Healed ${healingAmount} HP</span>`;
    rollDisplay += ` (Roll: ${baseRoll}, Level +${fighterLevel})`;
    rollDisplay += `<br class="sm:hidden"> &nbsp; <span class="text-gray-500 text-xs">(TM Check: ${tacticalResult} - ${tacticalSuccess ? 'Use Saved' : 'Use Expended'})</span>`;
    
    ELEMENTS.actionRollDisplay.innerHTML = rollDisplay;
    
    // --- 2. Update State ---
    // Update HP
    let newHP = characterState.currentHP + healingAmount;
    newHP = Math.min(newHP, BASE_STATS.MAX_HP); // Don't heal above max HP
    updateAndSaveState('currentHP', newHP);

    // Expend Use (only if Tactical Mind check fails)
    if (!tacticalSuccess) {
        updateAndSaveState('secondWindUses', characterState.secondWindUses - 1);
    }
    
    renderHP();
    renderResources();
};

/**
 * Handles the use of Action Surge.
 */
const handleActionSurgeUse = () => {
    if (characterState.actionSurgeUses <= 0) return;

    // --- 1. Perform Tactical Mind Check (DC 10 WIS Save) ---
    const wisMod = getModifier(BASE_STATS.WIS);
    const tacticalRoll = rollDie(20);
    const tacticalResult = tacticalRoll + wisMod;
    const tacticalSuccess = tacticalResult >= 10;
    
    let display = `<span class="text-white font-bold">Action Surge Used:</span> You gain 1 extra action.`;
    display += `<br class="sm:hidden"> &nbsp; <span class="text-gray-500 text-xs">(TM Check: ${tacticalResult} - ${tacticalSuccess ? 'Use Saved' : 'Use Expended'})</span>`;
    
    ELEMENTS.actionRollDisplay.innerHTML = display;

    // --- 2. Update State ---
    if (!tacticalSuccess) {
        updateAndSaveState('actionSurgeUses', characterState.actionSurgeUses - 1);
    }
    renderResources();
};

/**
 * Handles the use of Fire Rune (Bonus Action to Restrain).
 */
const handleFireRuneUse = () => {
    if (characterState.fireRuneUses <= 0) return;
    
    // --- 1. Perform Tactical Mind Check (DC 10 WIS Save) ---
    const wisMod = getModifier(BASE_STATS.WIS);
    const tacticalRoll = rollDie(20);
    const tacticalResult = tacticalRoll + wisMod;
    const tacticalSuccess = tacticalResult >= 10;
    
    let display = `<span class="text-white font-bold">Fire Rune Used:</span> Target DC 15 STR Save or be Restrained.`;
    display += `<br class="sm:hidden"> &nbsp; <span class="text-gray-500 text-xs">(TM Check: ${tacticalResult} - ${tacticalSuccess ? 'Use Saved' : 'Use Expended'})</span>`;

    ELEMENTS.actionRollDisplay.innerHTML = display;

    // --- 2. Update State ---
    if (!tacticalSuccess) {
        updateAndSaveState('fireRuneUses', characterState.fireRuneUses - 1);
    }
    renderResources();
};

/**
 * Handles the use of Cloud Rune (Reaction to Redirect Attack).
 */
const handleCloudRuneUse = () => {
    if (characterState.cloudRuneUses <= 0) return;
    
    let display = `<span class="text-white font-bold">Cloud Rune Used:</span> Attack is redirected to a new target within 30 ft.`;
    
    ELEMENTS.actionRollDisplay.innerHTML = display;

    // Note: Cloud Rune is a Reaction and does NOT get a Tactical Mind Check (TCoE rules).

    // --- Update State ---
    updateAndSaveState('cloud-rune-uses', characterState.cloudRuneUses - 1);
    renderResources();
};


// --- 9. HEALTH AND HP MANAGEMENT ---

/**
 * Handles manual changes to the HP inputs.
 * @param {object} event 
 */
const handleHpChange = (event) => {
    let value = parseInt(event.target.value);
    
    // Ensure value is a number, otherwise default to 0
    if (isNaN(value)) value = 0;
    
    if (event.target === ELEMENTS.currentHpInput) {
        updateAndSaveState('currentHP', value);
    } else if (event.target === ELEMENTS.tempHpInput) {
        updateAndSaveState('tempHP', value);
    }
    // No need to call renderHP() as the input value is already updated by the user event
    // The saveCharacterData() call inside updateAndSaveState handles persistence.
};

/**
 * Handles HP +/- button clicks.
 * @param {number} change - The amount to change HP by (+1 or -1).
 */
const handleHpButton = (change) => {
    let newHP = characterState.currentHP + change;
    
    // Do not allow HP to go below 0
    if (newHP < 0) newHP = 0;
    
    // Do not allow HP to go above Max HP (unless applying Temp HP, but this is Current HP button)
    // We allow going above max HP here so the user can quickly track the value if they want.
    // The Max HP limit is usually enforced on healing rolls.
    
    updateAndSaveState('currentHP', newHP);
    renderHP(); // Re-render to ensure input shows the new value (important if user was on Temp HP input)
};


// --- 10. TEXTAREA MANAGEMENT ---

/**
 * Debounced function to save Notes textarea content.
 */
const debouncedNotesChange = debounce(() => {
    updateAndSaveState('notes', ELEMENTS.notesTextarea.value);
}, 1000);

/**
 * Debounced function to save Origin Story textarea content.
 */
const debouncedOriginStoryChange = debounce(() => {
    updateAndSaveState('originStory', ELEMENTS.originStoryTextarea.value);
}, 1000);

/**
 * ==============================================================================================
 * D&D Character Sheet - app.js (Chunk 3 - FINAL)
 * ==============================================================================================
 */

// --- 11. INVENTORY FORM HANDLERS ---

/**
 * Handles adding a new Weapon via form submission.
 * @param {object} event 
 */
const handleAddWeapon = (event) => {
    event.preventDefault();

    const weaponName = document.getElementById('weapon-name').value;
    const damageDice = document.getElementById('weapon-damage-dice').value;
    const damageType = document.getElementById('weapon-damage-type').value;
    const properties = document.getElementById('weapon-properties').value;
    const attackStat = document.getElementById('weapon-attack-stat').value;

    const newWeapon = {
        type: 'weapon',
        name: weaponName,
        damageDice: damageDice,
        damageType: damageType,
        properties: properties,
        attackStat: attackStat,
        equipped: false, // Default to unequipped
    };

    addItem(newWeapon);
    event.target.reset(); // Clear the form
};

/**
 * Handles adding a new Armor via form submission.
 * @param {object} event 
 */
const handleAddArmor = (event) => {
    event.preventDefault();

    const armorName = document.getElementById('armor-name').value;
    const baseAC = parseInt(document.getElementById('armor-base-ac').value);
    const armorType = document.getElementById('armor-type').value;
    const modifier = document.getElementById('armor-modifier').value;

    if (isNaN(baseAC) || baseAC < 10) {
        alert("Base AC must be a number greater than or equal to 10.");
        return;
    }

    const newArmor = {
        type: 'armor',
        name: armorName,
        baseAC: baseAC,
        armorType: armorType,
        modifier: modifier || 'none',
        equipped: false,
    };

    addItem(newArmor);
    event.target.reset(); // Clear the form
};

/**
 * Handles coin input changes.
 * @param {object} event 
 */
const handleCoinChange = (event) => {
    const coinType = event.target.id.split('-')[0];
    const value = parseInt(event.target.value) || 0;
    updateAndSaveState(`coins.${coinType}`, value);
};

/**
 * Handles coin +/- button clicks.
 * @param {object} event 
 */
const handleCoinButton = (event) => {
    const button = event.target.closest('.coin-mod-button');
    if (!button) return;

    const coinType = button.dataset.type;
    const action = button.dataset.action;
    const inputElement = document.getElementById(`${coinType}-amount`);
    let currentValue = parseInt(inputElement.value) || 0;

    let newValue = action === 'plus' ? currentValue + 1 : currentValue - 1;

    // Do not allow negative coin counts
    if (newValue < 0) newValue = 0;

    inputElement.value = newValue;
    updateAndSaveState(`coins.${coinType}`, newValue);
};


// --- 12. UI NAVIGATION & SPLASH SCREEN ---

/**
 * Handles the click event for the splash screen to fade it out.
 * FIX: Immediately drops z-index to unblock clicks on main content.
 */
const handleSplashScreenClick = () => {
    // 1. Start the fade out.
    ELEMENTS.splashScreen.style.opacity = '0';
    
    // 2. IMMEDIATE FIX: Drop the z-index so clicks pass through to the content underneath.
    ELEMENTS.splashScreen.style.zIndex = '-1'; 
    
    // 3. Start the main content fade in.
    ELEMENTS.mainContent.style.opacity = '1';

    // 4. Clean up after transition ends (1 second).
    setTimeout(() => {
        ELEMENTS.splashScreen.classList.add('hidden');
        ELEMENTS.splashScreen.removeEventListener('click', handleSplashScreenClick);
    }, 1000); // Matches the opacity transition duration
};

/**
 * Handles the navigation between pages.
 * @param {object} event 
 */
const handleNavigation = (event) => {
    const targetPageId = event.target.dataset.page;
    if (!targetPageId) return;

    // 1. Update Navigation Bar styles
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
        btn.style.borderTopWidth = '2px';
        btn.style.borderTopColor = 'transparent';
    });
    
    event.target.classList.add('active');
    event.target.style.borderTopWidth = '4px';
    event.target.style.borderTopColor = '#ecc94b';

    // 2. Hide all pages and show the target page
    document.querySelectorAll('.page-content').forEach(page => {
        page.classList.add('hidden');
    });
    
    const targetPage = document.getElementById(targetPageId);
    if (targetPage) {
        targetPage.classList.remove('hidden');
    }
};


// --- 13. INITIALIZATION & EVENT LISTENERS ---

document.addEventListener('DOMContentLoaded', () => {
    
    // --- SET UP STATIC UI ELEMENTS ---
    
    // Create and insert the navigation bar dynamically since it wasn't in the provided HTML
    // We add it here to maintain separation of concerns and inject it right before the page-container.
    const navHtml = `
        <div id="nav-bar" class="flex justify-center -mx-4 sm:mx-0">
            <button class="nav-button active" data-page="page-main">Main</button>
            <button class="nav-button" data-page="page-actions">Actions</button>
            <button class="nav-button" data-page="page-features">Features</button>
            <button class="nav-button" data-page="page-inventory">Inventory</button>
            <button class="nav-button" data-page="page-background">Background</button>
            <button class="nav-button" data-page="page-notes">Notes</button>
        </div>
    `;
    const pageContainer = document.getElementById('page-container');
    if (pageContainer) {
        pageContainer.insertAdjacentHTML('beforebegin', navHtml);
    }

    // Re-select the nav bar after insertion
    ELEMENTS.navBar = document.getElementById('nav-bar');
    
    // --- LOAD DATA AND RENDER UI ---

    // Initialize Persistence logic (loads state)
    initializePersistence();
    
    // Initial UI render based on loaded state
    renderAllDynamicContent();


    // --- ATTACH EVENT LISTENERS ---

    // Splash Screen Listener
    ELEMENTS.splashScreen.addEventListener('click', handleSplashScreenClick);

    // HP Button Listeners
    ELEMENTS.hpPlusButton.addEventListener('click', () => handleHpButton(1));
    ELEMENTS.hpMinusButton.addEventListener('click', () => handleHpButton(-1));

    // Rest Button Listeners
    ELEMENTS.longRestButton.addEventListener('click', () => {
        if (confirm("Are you sure you want to take a Long Rest? This will reset your HP to MAX and all resources.")) {
            resetResources('long');
            renderHP(); // Ensure HP is updated immediately
        }
    });
    ELEMENTS.shortRestButton.addEventListener('click', () => {
        if (confirm("Are you sure you want to take a Short Rest? This will reset many resources.")) {
            resetResources('short');
        }
    });

    // Resource Button Listeners
    ELEMENTS.activateGiantsMightButton.addEventListener('click', () => {
        updateAndSaveState('isGiantsMightActive', true);
        updateAndSaveState('giantsMightUses', characterState.giantsMightUses - 1);
    });
    ELEMENTS.deactivateGiantsMightButton.addEventListener('click', () => {
        updateAndSaveState('isGiantsMightActive', false);
    });
    ELEMENTS.secondWindButton.addEventListener('click', handleSecondWindRoll);
    ELEMENTS.actionSurgeButton.addEventListener('click', handleActionSurgeUse);
    ELEMENTS.fireRuneButton.addEventListener('click', handleFireRuneUse);
    ELEMENTS.cloudRuneButton.addEventListener('click', handleCloudRuneUse);

    // Inventory Form Listeners
    ELEMENTS.addWeaponForm.addEventListener('submit', handleAddWeapon);
    ELEMENTS.addArmorForm.addEventListener('submit', handleAddArmor);

    // HP Change listener (using 'input' for better responsiveness than 'change')
    ELEMENTS.mainContent.addEventListener('input', (event) => {
        if (event.target === ELEMENTS.currentHpInput || event.target === ELEMENTS.tempHpInput) {
            handleHpChange(event);
        }
    });
    
    // Textarea listeners (Debounced for performance)
    ELEMENTS.notesTextarea.addEventListener('input', debouncedNotesChange); 
    ELEMENTS.originStoryTextarea.addEventListener('input', debouncedOriginStoryChange);
    
    // --- DELEGATED EVENT LISTENERS (For dynamic content) ---
    
    document.addEventListener('click', (event) => {
        // Coin Buttons
        if (event.target.closest('.coin-mod-button')) {
            handleCoinButton(event);
        }

        // Coin Inputs (Need an extra listener for direct value changes)
        if (event.target.closest('.coin-input')) {
            handleCoinChange(event);
        }

        // D20 Rolls (Skills/Saves)
        const rollable = event.target.closest('.skill-rollable, .save-rollable');
        if (rollable) {
            const rollName = rollable.dataset.skillName || rollable.dataset.saveName;
            const modifier = rollable.querySelector('.bonus').textContent.trim();
            const rollType = rollable.dataset.rollType || 'normal';
            const displayElement = rollable.classList.contains('skill-rollable') ? ELEMENTS.skillRollDisplay : ELEMENTS.saveRollDisplay;
            handleD20Roll(rollName, modifier, rollType, displayElement);
        }
        
        // Quick Dice Roller Bar
        const diceButton = event.target.closest('.dice-button-svg');
        if (diceButton) {
            const dieSize = diceButton.dataset.die;
            const rollResult = rollDie(parseInt(dieSize));
            ELEMENTS.skillRollDisplay.innerHTML = `<span class="text-white font-bold">D${dieSize} Roll: ${rollResult}</span>`;
        }
        
        // Action Rolls (Weapon Hit/Damage)
        const actionRollButton = event.target.closest('.action-roll-button');
        if (actionRollButton && !actionRollButton.hasAttribute('disabled')) {
            handleActionRoll(actionRollButton);
        }

        // Inventory Equip/Unequip/Delete
        const equipButton = event.target.closest('.equip-button');
        const unequipButton = event.target.closest('.unequip-button');
        const deleteButton = event.target.closest('.delete-button');

        if (equipButton) {
            const itemId = equipButton.dataset.itemId;
            toggleEquipStatus(itemId, true);
        } else if (unequipButton) {
            const itemId = unequipButton.dataset.itemId;
            toggleEquipStatus(itemId, false);
        } else if (deleteButton) {
            const itemId = deleteButton.dataset.itemId;
            deleteItem(itemId);
        }

        // Navigation (placed last to prevent capturing other button clicks)
        const navButton = event.target.closest('.nav-button');
        if (navButton) {
            handleNavigation(event);
        }
    });
});