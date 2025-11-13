// --- FIX: Import modules from their correct URLs ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js"; 
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, setDoc, setLogLevel, collection, onSnapshot as onCollectionSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONSTANTS AND STATE ---

// --- Custom Base64 Image Placeholder ---
const EMBEDDED_PORTRAIT_BASE64 = ""; 

// Global Game Constants (Derived from Main Page Stats)
// THESE ARE NOW DEPRECATED as they will be loaded from characterState
// const STR_SCORE = 20; 
// const DEX_SCORE = 11;
// const PROFICIENCY_BONUS = 2;
// const STR_MODIFIER = 5; 
// const DEX_MODIFIER = 0;
// const MELEE_ATTACK_MOD = STR_MODIFIER + PROFICIENCY_BONUS;
// const RANGED_ATTACK_MOD = DEX_MODIFIER + PROFICIENCY_BONUS;

const baseAC = 10;
let currentAC = baseAC; 

// Global Firebase and Environment References
let db;
let auth;
let userId = null;
let characterDocRef; // This will now be DYNAMICALLY set
let activeCharacterListener = null; // Holds the active onSnapshot listener
let isFirebaseReady = false;
let initialLoadComplete = false;
let isLocalMode = false;
let isEditMode = false; // *** NEW: Tracks if we are creating or editing

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// NEW: DB_COLLECTION is now the *collection* of characters
const DB_COLLECTION = 'dnd_sheet'; 
const DB_PATH = `/artifacts/${appId}/users`;

// NEW: Roll History State
let skillRollHistory = [];
let saveRollHistory = [];
let actionRollHistory = [];
let currentSkillHistoryIndex = -1;
let currentSaveHistoryIndex = -1;
let currentActionHistoryIndex = -1;

/**
 * Generates the default inventory if none is loaded from persistence.
 */
function getDefaultInventory() {
    // New characters start with an empty inventory
    return [];
}

// *** NEW: CLASS-TO-SAVING-THROW MAPPING (For Next Goal) ***
const CLASS_TO_SAVES = {
    "Barbarian": ["str", "con"],
    "Bard": ["dex", "cha"],
    "Cleric": ["wis", "cha"],
    "Druid": ["int", "wis"],
    "Fighter": ["str", "con"],
    "Monk": ["str", "dex"],
    "Paladin": ["wis", "cha"],
    "Ranger": ["str", "dex"],
    "Rogue": ["dex", "int"],
    "Sorcerer": ["con", "cha"],
    "Warlock": ["wis", "cha"],
    "Wizard": ["int", "wis"],
    "Unknown": []
};

// Consolidated local state object (synced with Firestore)
// This now acts as a *template* or *default* for a new character
let characterState = {
    name: "New Character",
    race: "Unknown",
    class: "Unknown",
    level: 1,
    proficiencyBonus: 2,
    scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    modifiers: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    maxHp: 10,
    currentHp: 10,
    tempHp: 0,
    baseAc: 10,
    speed: 30,
    saveProficiencies: { str: false, dex: false, con: false, int: false, wis: false, cha: false },
    skillProficiencies: {
        acrobatics: false, animalhandling: false, arcana: false, athletics: false,
        deception: false, history: false, insight: false, intimidation: false,
        investigation: false, medicine: false, nature: false, perception: false,
        performance: false, persuasion: false, religion: false, sleightofhand: false,
        stealth: false, survival: false
    },
    features: { fightingStyle: "None", feat1: "None", feat2: "None", runes: {} },
    background: { name: "Unknown", feature: "None", story: "" },
    inventory: getDefaultInventory(),
    notesContent: "",
    characterPortrait: EMBEDDED_PORTRAIT_BASE64, 
    originStoryContent: "",
    platinum: 0,
    gold: 0,
    electrum: 0,
    silver: 0,
    copper: 0,
    giantsMightUses: 0,
    isGiantsMightActive: false,
    tacticalMindUses: 0,
    secondWindUses: 0,
    fireRuneUses: 0,
    cloudRuneUses: 0,
    actionSurgeUses: 0,
};

// --- DOM ELEMENTS (Defined later in DOMContentLoaded) ---
let ELEMENTS = {};


// --- UTILITY FUNCTIONS ---

/**
 * Debounce utility to limit function calls over time.
 */
const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

/**
 * Generates a unique ID for new inventory items.
 */
const generateUniqueId = () => {
     return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

/**
 * Calculates the ability modifier for a given score.
 * This is duplicated from the Creation logic below but kept here for general utility.
 * @param {number} score - The ability score (e.g., 10, 20).
 * @returns {number} The modifier (e.g., 0, +5).
 */
function calculateModifier(score) {
    return Math.floor((score - 10) / 2);
}

/**
 * Custom persistence logic using localStorage when Firebase is unavailable.
 * UPDATED for Multi-Character (rudimentary)
 */
const localPersist = {
    save(state, docId) {
        try {
            // For now, just save the *last loaded* character
            localStorage.setItem('dnd_sheet_state', JSON.stringify(state));
            localStorage.setItem('dnd_sheet_last_id', docId);
            console.log(`State synced to LocalStorage for ${docId}.`);
        } catch (e) {
            console.error("Error saving to LocalStorage:", e);
        }
    },
    load(docId) {
        try {
            // For now, just load the *last saved* character
            const savedState = localStorage.getItem('dnd_sheet_state');
            if (savedState) {
                const loaded = JSON.parse(savedState);
                if (!loaded.inventory || !Array.isArray(loaded.inventory)) {
                    loaded.inventory = getDefaultInventory();
                }
                return loaded;
            }
        } catch (e) {
            console.error("Error loading from LocalStorage, returning default state:", e);
        }
        return characterState; // Return default template
    },
    loadCharacterList() {
        // Mock a character list for local mode
        const lastId = localStorage.getItem('dnd_sheet_last_id');
        const lastState = localStorage.getItem('dnd_sheet_state');
        if (lastId && lastState) {
            const state = JSON.parse(lastState);
            return [{ id: lastId, data: () => state }];
        }
        return []; // No characters saved yet
    }
};

/**
 * Safely determines Firebase config and sets local mode flag.
 */
const getFirebaseConfig = () => {
    try {
        const configString = typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';
        const config = JSON.parse(configString);
        
        if (!config.projectId) {
            isLocalMode = true;
            console.warn("Firebase configuration not found. Using LocalStorage persistence.");
            return { apiKey: "MOCK_API_KEY", authDomain: "mock-project.firebaseapp.com", projectId: "mock-project" };
        }
        
        return config;
    } catch (e) {
        isLocalMode = true;
        console.error("Error parsing firebase config, switching to LocalStorage:", e);
        return { apiKey: "MOCK_API_KEY", authDomain: "mock-project.firebaseapp.com", projectId: "mock-project" };
    }
};


// --- STATE MANAGEMENT CORE ---

/**
 * Saves the current characterState object to persistence (Firestore or LocalStorage).
 * @param {object} state - The full current state object to save.
 */
async function syncStateToPersistence(state) {
    if (isLocalMode) {
        // localPersist.save needs the docId, which isn't in the state.
        // We need to know which docId is active.
        // For now, this is handled in updateState
        return;
    }
    
    if (!isFirebaseReady || !characterDocRef) {
        console.warn("Firestore not ready or characterDocRef is not set. Cannot save data.");
        return;
    }
    
    try {
        // This now saves to the DYNAMICALLY set characterDocRef
        await setDoc(characterDocRef, state, { merge: true });
        console.log(`State synced to Firestore for ${characterDocRef.id}`);
    } catch (e) {
        console.error("Error writing document to Firestore:", e);
    }
}

/**
 * Centralized function to update the global state, trigger persistence, and update UI.
 * @param {object} updates - Partial state update object (e.g., { currentHp: 20, giantsMightUses: 1 })
 */
function updateState(updates) {
    // 1. Merge the update into the current local state
    Object.assign(characterState, updates);

    // 2. Trigger persistence 
    if (isLocalMode) {
        // Find the active doc ID (this is a bit of a hack for local mode)
        const activeId = localStorage.getItem('dnd_sheet_last_id') || 'local-character';
        localPersist.save(characterState, activeId);
    } else {
        syncStateToPersistence(characterState); 
    }

    // 3. Manually update *all* dependent UI elements
    updateAllDisplays();
}

// --- UI RENDERING FUNCTIONS ---

/**
 * Renders all equipped weapons into the Actions list.
 */
function renderEquippedWeapons() {
    if (!characterState.inventory) characterState.inventory = [];
    
    // NEW: Calculate dynamic modifiers based on loaded state
    const strMod = characterState.modifiers.str;
    const dexMod = characterState.modifiers.dex;
    const profBonus = characterState.proficiencyBonus;

    const meleeAttackMod = strMod + profBonus;
    const rangedAttackMod = dexMod + profBonus;

    const equippedWeapons = characterState.inventory.filter(item => 
        item.type === 'Weapon' && item.isEquipped
    );

    const actionsList = ELEMENTS.actionsListContainer;
    actionsList.innerHTML = ''; // Clear all dynamic content

    let dynamicWeaponCards = '';
    
    equippedWeapons.forEach(weapon => {
        // Determine modifier based on attack type
        // NOTE: The combat logic is correct per D&D 5e rules, but the damage roll will need the ability modifier passed
        // For the attack roll (to hit), the attackMod is AbilityMod + ProfBonus (if proficient)
        const attackModBase = weapon.attackType === 'Melee' ? strMod : dexMod;
        const attackMod = attackModBase + (weapon.isProficient ? profBonus : 0);
        
        const damageAbilityMod = weapon.attackType === 'Melee' ? strMod : dexMod;
        
        const hitString = `1d20+${attackMod}`;
        const damageModDisplay = damageAbilityMod > 0 ? ` + ${damageAbilityMod}` : (damageAbilityMod < 0 ? ` - ${Math.abs(damageAbilityMod)}` : '');
        const attackModDisplay = attackMod >= 0 ? `+${attackMod}` : attackMod;

        const itemHtml = `
            <div class="action-card bg-gray-900 rounded-lg p-4 border border-gray-700 shadow-md" data-item-id="${weapon.id}" data-weapon-type="${weapon.properties}">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3">
                    <h4 class="text-xl font-bold text-white">${weapon.name}</h4>
                    <div class="flex space-x-2 mt-2 sm:mt-0">
                        <span class="text-xs font-semibold bg-gray-700 text-gray-300 px-2 py-1 rounded-full">${weapon.attackType} Weapon</span>
                        ${weapon.isProficient ? '<span class="text-xs font-semibold bg-blue-900 text-blue-300 px-2 py-1 rounded-full">Proficient</span>' : ''}
                        ${weapon.properties ? `<span class="text-xs font-semibold bg-purple-900 text-purple-300 px-2 py-1 rounded-full">${weapon.properties.split(',')[0].trim()}</span>` : ''}
                    </div>
                </div>

                <div class="flex flex-col sm:flex-row items-center gap-4 mb-3 text-center">
                    <div class="grid grid-cols-3 gap-4 flex-grow">
                        <div>
                            <div class="text-xs font-bold uppercase text-gray-400">Range</div>
                            <div class="text-lg font-semibold">${weapon.reach}ft.</div>
                        </div>
                        <div>
                            <div class="text-xs font-bold uppercase text-gray-400">Hit / DC</div>
                            <div class="text-lg font-semibold text-yellow-300">${attackModDisplay}</div>
                        </div>
                        <div>
                            <div class="text-xs font-bold uppercase text-gray-400">Damage</div>
                            <div class="text-lg font-semibold">${weapon.damage}${damageModDisplay}</div>
                        </div>
                    </div>
                    <div class="flex space-x-2 flex-shrink-0 mt-3 sm:mt-0">
                        <button class="action-roll-button" 
                            data-roll="${hitString}"
                            data-roll-name="${weapon.name} Hit" 
                            data-roll-type="hit">
                            Roll Hit
                        </button>
                        <button class="action-roll-button" 
                            data-roll="${weapon.damage}"
                            data-roll-name="${weapon.name} Dmg" 
                            data-roll-type="damage"
                            data-attack-type="${weapon.attackType}"
                            data-damage-mod="${damageAbilityMod}"
                            data-is-gwf="${(weapon.properties || '').toLowerCase().includes('heavy') || (weapon.properties || '').toLowerCase().includes('two-handed') ? 'true' : 'false'}" 
                            data-is-gm-eligible="true">
                            Roll Damage
                        </button>
                    </div>
                </div>

                <div>
                    <div class="text-xs font-bold uppercase text-gray-400">Notes</div>
                    <p class="text-sm text-gray-300">${weapon.notes || '—'}</p>
                </div>
            </div>
        `;
        dynamicWeaponCards += itemHtml;
    });
    
    actionsList.innerHTML = dynamicWeaponCards;
    
    // Add Unarmed Strike if no other weapons are equipped
    if (equippedWeapons.length === 0) {
        const unarmedAttackMod = meleeAttackMod;
        const unarmedDamageMod = strMod;
        const unarmedHitString = `1d20+${unarmedAttackMod}`;
        const unarmedDamageModDisplay = unarmedDamageMod > 0 ? ` + ${unarmedDamageMod}` : (unarmedDamageMod < 0 ? ` - ${Math.abs(unarmedDamageMod)}` : '');
        
        actionsList.innerHTML = `
            <div id="unarmed-strike-card" class="action-card bg-gray-900 rounded-lg p-4 border border-gray-700 shadow-md">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3">
                    <h4 class="text-xl font-bold text-white">Unarmed Strike</h4>
                </div>
                <div class="flex flex-col sm:flex-row items-center gap-4 mb-3 text-center">
                    <div class="grid grid-cols-3 gap-4 flex-grow">
                        <div><div class="text-xs font-bold uppercase text-gray-400">Range</div><div class="text-lg font-semibold">5ft.</div></div>
                        <div><div class="text-xs font-bold uppercase text-gray-400">Hit / DC</div><div class="text-lg font-semibold text-yellow-300">${unarmedAttackMod >= 0 ? '+' : ''}${unarmedAttackMod}</div></div>
                        <div><div class="text-xs font-bold uppercase text-gray-400">Damage</div><div class="text-lg font-semibold">1${unarmedDamageModDisplay}</div></div>
                    </div>
                    <div class="flex space-x-2 flex-shrink-0 mt-3 sm:mt-0">
                        <button class="action-roll-button" data-roll="${unarmedHitString}" data-roll-name="Unarmed Hit" data-roll-type="hit">Roll Hit</button>
                        <button class="action-roll-button" data-roll="1" data-roll-name="Unarmed Dmg" data-roll-type="static" data-attack-type="Melee" data-damage-mod="${unarmedDamageMod}">Show Damage</button>
                    </div>
                </div>
            </div>
        `;
    }
}

/**
 * Renders all inventory items dynamically into the list container (Inventory Page).
 */
function renderInventory() {
    if (!ELEMENTS.inventoryListContainer) return;
    if (!characterState.inventory) characterState.inventory = [];

    // NEW: Calculate dynamic modifiers
    const strMod = characterState.modifiers.str;
    const dexMod = characterState.modifiers.dex;

    ELEMENTS.inventoryListContainer.innerHTML = '';
    
    characterState.inventory.forEach((item) => {
        const isEquipped = item.isEquipped;
        const buttonColor = isEquipped ? 'bg-red-600 hover:bg-red-700 border-red-500' : 'bg-green-600 hover:bg-green-700 border-green-500';
        const buttonText = isEquipped ? 'Unequip' : 'Equip';
        
        let tagType, tagValue;
        if (item.type === 'Armor') {
            tagType = 'AC:';
            tagValue = item.ac;
        } else if (item.type === 'Weapon') {
            tagType = 'Damage:';
            const damageModValue = item.attackType === 'Melee' ? strMod : dexMod;
            const damageMod = damageModValue > 0 ? ` + ${damageModValue}` : (damageModValue < 0 ? ` - ${Math.abs(damageModValue)}` : '');
            tagValue = item.damage + damageMod;
        } else {
            tagType = 'Type:';
            tagValue = item.type;
        }
        
        const equipButtonHtml = `<button class="action-roll-button ${buttonColor} toggle-equip-btn" data-item-id="${item.id}" data-item-type="${item.type}">${buttonText} ${item.type}</button>`;


        let itemHtml = `
            <div class="bg-gray-900 rounded-lg p-4 border border-gray-700 shadow-md" data-item-id="${item.id}">
                <div class="flex justify-between items-center mb-2">
                    <h4 class="text-xl font-bold text-white">${item.name}</h4>
                    <span class="text-xs font-semibold bg-gray-700 text-gray-300 px-2 py-1 rounded-full">${item.type}</span>
                </div>
                
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
                    <div><span class="text-gray-400 uppercase font-semibold">${tagType}</span> <span class="text-white text-lg font-bold">${tagValue || '—'}</span></div>
                    <div><span class="text-gray-400 uppercase font-semibold">Weight:</span> ${item.weight || 0} lb.</div>
                    <div><span class="text-gray-400 uppercase font-semibold">Cost:</span> ${item.cost || 0} gp</div>
                    <div><span class="text-gray-400 uppercase font-semibold">Proficient:</span> ${item.isProficient ? 'Yes' : 'No'}</div>
                </div>
                
                <p class="text-sm text-gray-300 border-t border-gray-700 pt-3">${item.notes || '—'}</p>
                
                <div class="flex justify-end space-x-2 mt-4 pt-4 border-t border-gray-700">
                    ${equipButtonHtml}
                    <button class="action-roll-button bg-red-700 hover:bg-red-800 border-red-600 delete-item-btn" data-item-id="${item.id}">
                        Delete
                    </button>
                </div>
            </div>
        `;
        ELEMENTS.inventoryListContainer.insertAdjacentHTML('beforeend', itemHtml);
    });
}

/**
 * Updates all necessary DOM elements based on the current characterState.
 * This is now the master "render" function for the character sheet.
 */
 function updateAllDisplays() {
    if (!initialLoadComplete) return; // Don't render if we haven't loaded a character yet

    // --- Vitals ---
    if (ELEMENTS.charSheetName) ELEMENTS.charSheetName.textContent = characterState.name;
    if (ELEMENTS.charSheetRace) ELEMENTS.charSheetRace.textContent = characterState.race;
    if (ELEMENTS.charSheetClassLevel) ELEMENTS.charSheetClassLevel.textContent = `${characterState.class} ${characterState.level}`;

    // --- HP and Textareas ---
    if (ELEMENTS.currentHpInput) ELEMENTS.currentHpInput.value = characterState.currentHp;
    if (ELEMENTS.maxHpSpan) ELEMENTS.maxHpSpan.textContent = characterState.maxHp;
    if (ELEMENTS.tempHpInput) ELEMENTS.tempHpInput.value = characterState.tempHp;
    if (ELEMENTS.notesTextarea) ELEMENTS.notesTextarea.value = characterState.notesContent;
    if (ELEMENTS.originStoryTextarea) ELEMENTS.originStoryTextarea.value = characterState.background.story || "";
    
    // --- Currency Displays ---
    if (ELEMENTS.coinPpDisplay) ELEMENTS.coinPpDisplay.textContent = characterState.platinum;
    if (ELEMENTS.coinGpDisplay) ELEMENTS.coinGpDisplay.textContent = characterState.gold;
    if (ELEMENTS.coinEpDisplay) ELEMENTS.coinEpDisplay.textContent = characterState.electrum;
    if (ELEMENTS.coinSpDisplay) ELEMENTS.coinSpDisplay.textContent = characterState.silver;
    if (ELEMENTS.coinCpDisplay) ELEMENTS.coinCpDisplay.textContent = characterState.copper;
    
    // --- Clear inputs after update ---
    if (ELEMENTS.coinPpInput) ELEMENTS.coinPpInput.value = 0;
    if (ELEMENTS.coinGpInput) ELEMENTS.coinGpInput.value = 0;
    if (ELEMENTS.coinEpInput) ELEMENTS.coinEpInput.value = 0;
    if (ELEMENTS.coinSpInput) ELEMENTS.coinSpInput.value = 0;
    if (ELEMENTS.coinCpInput) ELEMENTS.coinCpInput.value = 0;

    if (ELEMENTS.portraitImg) ELEMENTS.portraitImg.src = characterState.characterPortrait || EMBEDDED_PORTRAIT_BASE64;

    // --- Stats & Bonuses ---
    const { scores, modifiers, proficiencyBonus } = characterState;
    if (ELEMENTS.charSheetProfBonus) ELEMENTS.charSheetProfBonus.textContent = `+${proficiencyBonus}`;
    if (ELEMENTS.charSheetSpeed) ELEMENTS.charSheetSpeed.textContent = `${characterState.speed} ft.`;

    // --- Ability Scores Blocks (CRITICAL STABILITY FIX APPLIED HERE) ---
    const statBlockUpdate = (stat, score, modifier) => {
        const el = document.getElementById(`stat-${stat}`);
        if (el) {
            const prefix = modifier >= 0 ? '+' : '';
            // Use .toUpperCase() for display label for consistency
            el.innerHTML = `<div class="modifier">${prefix}${modifier}</div><div class="score">${score}</div><div class="label mt-1">${stat.toUpperCase()}</div>`;
        }
    };
    
    statBlockUpdate('str', scores.str, modifiers.str);
    statBlockUpdate('dex', scores.dex, modifiers.dex);
    statBlockUpdate('con', scores.con, modifiers.con);
    statBlockUpdate('int', scores.int, modifiers.int);
    statBlockUpdate('wis', scores.wis, modifiers.wis);
    statBlockUpdate('cha', scores.cha, modifiers.cha);
    // ------------------------------------------------------------------

    // --- Saving Throws ---
    const saves = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    saves.forEach(stat => {
        const isProf = characterState.saveProficiencies[stat];
        const modifier = modifiers[stat] + (isProf ? proficiencyBonus : 0);
        const el = document.getElementById(`save-${stat}`);
        if (el) {
             el.className = `save-item save-rollable flex justify-between items-center p-3 rounded-lg ${isProf ? 'proficient' : ''}`;
             el.dataset.modifier = modifier;
             const bonusEl = el.querySelector('.bonus');
             if (bonusEl) bonusEl.textContent = `${modifier >= 0 ? '+' : ''}${modifier}`;
        }
    });

    // --- Skills ---
    const skills = {
        acrobatics: "dex", animalhandling: "wis", arcana: "int", athletics: "str",
        deception: "cha", history: "int", insight: "wis", intimidation: "cha",
        investigation: "int", medicine: "wis", nature: "int", perception: "wis",
        performance: "cha", persuasion: "cha", religion: "int", sleightofhand: "dex",
        stealth: "dex", survival: "wis"
    };

    for (const [skill, stat] of Object.entries(skills)) {
        const isProf = characterState.skillProficiencies[skill];
        const modifier = modifiers[stat] + (isProf ? proficiencyBonus : 0);
        const el = document.getElementById(`skill-${skill}`);
        if (el) {
             el.className = `skill-item skill-rollable flex justify-between items-center p-3 rounded-lg ${isProf ? 'proficient' : ''}`;
             el.dataset.modifier = modifier;
             const bonusEl = el.querySelector('.bonus');
             if (bonusEl) bonusEl.textContent = `${modifier >= 0 ? '+' : ''}${modifier}`;
        }
    }

    // --- Senses ---
    const percMod = modifiers.wis + (characterState.skillProficiencies.perception ? proficiencyBonus : 0);
    const invMod = modifiers.int + (characterState.skillProficiencies.investigation ? proficiencyBonus : 0);
    const insMod = modifiers.wis + (characterState.skillProficiencies.insight ? proficiencyBonus : 0);
    if (document.getElementById('passive-perception')) document.getElementById('passive-perception').textContent = 10 + percMod;
    if (document.getElementById('passive-investigation')) document.getElementById('passive-investigation').textContent = 10 + invMod;
    if (document.getElementById('passive-insight')) document.getElementById('passive-insight').textContent = 10 + insMod;

    // --- AC calculation ---
    if (!characterState.inventory) characterState.inventory = [];
    const equippedArmor = characterState.inventory.find(item => item.type === 'Armor' && item.isEquipped);
    
    if (equippedArmor) {
        let calculatedAC = equippedArmor.ac;
        if (equippedArmor.maxDex !== undefined) {
            const dexBonus = modifiers.dex;
            if (equippedArmor.maxDex === 0) {
                calculatedAC += 0;
            } else if (equippedArmor.maxDex === null || equippedArmor.maxDex === undefined) {
                calculatedAC += dexBonus;
            } else {
                calculatedAC += Math.min(dexBonus, equippedArmor.maxDex);
            }
        }
        currentAC = calculatedAC;
    } else {
        currentAC = characterState.baseAc + modifiers.dex;
    }
    if (ELEMENTS.acDisplay) ELEMENTS.acDisplay.textContent = currentAC;
    
    // --- Render dynamic content ---
    renderInventory();
    renderEquippedWeapons(); 
    
    // --- Background Page ---
    if (ELEMENTS.backgroundName) ELEMENTS.backgroundName.textContent = characterState.background.name;
    if (ELEMENTS.backgroundFeatureName) ELEMENTS.backgroundFeatureName.textContent = `Feature: ${characterState.background.feature}`;
    if (ELEMENTS.backgroundFeatureDesc) ELEMENTS.backgroundFeatureDesc.textContent = "Feature description will load here once implemented.";
    
    // --- Features Page (Placeholder) ---
    if (ELEMENTS.featuresContainer) ELEMENTS.featuresContainer.innerHTML = `<p class="text-gray-400">Feature rendering is not yet implemented.</p>`;
    
    // TODO: Re-build Action/Bonus Action/Other lists based on features
    
}

/**
 * Loads the *selected* character's state from persistence and updates the UI.
 */
function loadCharacter(docId) {
    console.log(`Loading character: ${docId}`);
    
    // 1. Unsubscribe from the old character listener, if it exists
    if (activeCharacterListener) {
        activeCharacterListener(); // This is the unsubscribe function
        activeCharacterListener = null;
    }

    if (isLocalMode) {
        // In local mode, just load the one saved state
        const state = localPersist.load(docId);
        Object.assign(characterState, state);
        if (!initialLoadComplete) initialLoadComplete = true;
        updateAllDisplays();
        showAppPage('page-character-sheet');
        return;
    }

    // 2. Create a new document reference
    characterDocRef = doc(db, `${DB_PATH}/${userId}/${DB_COLLECTION}/${docId}`);
    
    // 3. Start a new snapshot listener
    activeCharacterListener = onSnapshot(characterDocRef, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            // Deep merge loaded data into local state
            Object.assign(characterState, data);
            
            // Ensure nested objects exist (for older data)
            if (!characterState.scores) characterState.scores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
            if (!characterState.modifiers) characterState.modifiers = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
            if (!characterState.background) characterState.background = { name: "Unknown", feature: "None", story: "" };
            if (!characterState.skillProficiencies) characterState.skillProficiencies = {};
            if (!characterState.saveProficiencies) characterState.saveProficiencies = {};

            if (!initialLoadComplete) initialLoadComplete = true;
            
            // 4. Update UI
            updateAllDisplays();
        } else {
            console.error("Failed to load character: Document does not exist.");
            alert("Error: Could not load selected character.");
            showAppPage('page-landing');
        }
    }, (error) => {
        console.error("Error loading data from Firestore:", error);
    });

    // 5. Navigate to the character sheet
    showAppPage('page-character-sheet');
}

/**
 * Renders the list of characters on the landing page.
 */
function renderCharacterList(snapshot) {
    const container = ELEMENTS.characterListContainer;
    if (!container) return; // Safeguard
    
    container.innerHTML = ''; // Clear "Loading..."

    if (snapshot.empty) {
        container.innerHTML = '<p class="text-gray-400 text-center">No characters found. Create one to get started!</p>';
        return;
    }
    
    snapshot.forEach(doc => {
        const char = doc.data();
        const button = document.createElement('button');
        button.className = "bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg shadow-md transition duration-200 text-2xl w-full";
        button.innerHTML = `Load: ${char.name} <span class="text-sm text-blue-200 block">${char.class} ${char.level}</span>`;
        
        // Add click listener to load this specific character
        button.addEventListener('click', () => {
            loadCharacter(doc.id);
        });
        
        container.appendChild(button);
    });
}


// --- FIREBASE AND INITIALIZATION ---

/**
 * Initializes Firebase, signs in, and starts listening to data changes.
 */
async function initializePersistence() {
    const firebaseConfig = getFirebaseConfig();

    if (isLocalMode) {
        // In local mode, mock the character list
        const charList = localPersist.loadCharacterList();
        renderCharacterList({
            empty: charList.length === 0,
            forEach: (callback) => charList.forEach(callback)
        });
        // We still need to load *one* character if one exists
        if (charList.length > 0) {
            // This will load the character but not switch pages
            loadCharacter(charList[0].id);
        }
        return;
    }
    
    // --- FIREBASE INITIALIZATION ---
    setLogLevel('Debug');

    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
        
        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                isFirebaseReady = true;
                
                // NEW: Listen to the *collection* of characters
                const charactersCollectionRef = collection(db, `${DB_PATH}/${userId}/${DB_COLLECTION}`);
                
                onCollectionSnapshot(charactersCollectionRef, (snapshot) => {
                    renderCharacterList(snapshot);
                }, (error) => {
                    console.error("Error listening to character collection:", error);
                    if (ELEMENTS.characterListContainer) ELEMENTS.characterListContainer.innerHTML = '<p class="text-red-400 text-center">Error loading character list.</p>';
                });

            } else {
                console.error("User not authenticated.");
            }
        });

    } catch (e) {
        console.error("Firebase Initialization Failed:", e);
        if (!isLocalMode) {
            isLocalMode = true;
            console.warn("Falling back to LocalStorage persistence.");
            initializePersistence(); // Re-run in local mode
        }
    }
}

// --- CURRENCY HANDLER FUNCTIONS (NEW) ---

/**
 * Parses currency inputs and returns an object of validated coin amounts.
 * @returns {{pp: number, gp: number, ep: number, sp: number, cp: number}}
 */
function getCoinInputs() {
    const parseAndValidate = (element) => {
        if (!element) return 0; // Safeguard for missing element
        const val = parseInt(element.value, 10);
        return isNaN(val) ? 0 : val;
    };

    return {
        pp: parseAndValidate(ELEMENTS.coinPpInput),
        gp: parseAndValidate(ELEMENTS.coinGpInput),
        ep: parseAndValidate(ELEMENTS.coinEpInput),
        sp: parseAndValidate(ELEMENTS.coinSpInput),
        cp: parseAndValidate(ELEMENTS.coinCpInput),
    };
}

/**
 * Adds coinage based on form inputs.
 */
function handleCoinAdd() {
    const inputCoins = getCoinInputs();
    let hasInput = false;
    let updates = {};

    if (inputCoins.pp !== 0) { updates.platinum = (characterState.platinum || 0) + inputCoins.pp; hasInput = true; }
    if (inputCoins.gp !== 0) { updates.gold = (characterState.gold || 0) + inputCoins.gp; hasInput = true; }
    if (inputCoins.ep !== 0) { updates.electrum = (characterState.electrum || 0) + inputCoins.ep; hasInput = true; }
    if (inputCoins.sp !== 0) { updates.silver = (characterState.silver || 0) + inputCoins.sp; hasInput = true; }
    if (inputCoins.cp !== 0) { updates.copper = (characterState.copper || 0) + inputCoins.cp; hasInput = true; }

    if (hasInput) {
        updateState(updates);
        addRollToHistory('action', `<span class="text-green-400 font-bold">COIN ADDED!</span> Currency totals updated.`);
    } else {
        addRollToHistory('action', `<span class="text-yellow-400 font-bold">Input Error:</span> Please enter a value greater than zero to add.`);
    }
}

/**
 * Subtracts coinage based on form inputs, ensuring amounts don't go below zero.
 */
function handleCoinRemove() {
    const inputCoins = getCoinInputs();
    let hasInput = false;
    let updates = {};
    let errorMessage = '';
    
    // Check if any positive value was entered to determine if an action was intended
    if (Object.values(inputCoins).every(c => c <= 0)) {
         addRollToHistory('action', `<span class="text-yellow-400 font-bold">Input Error:</span> Please enter a value greater than zero to remove.`);
         return;
    }

    const safeSubtract = (current, input, coinName) => {
        current = current || 0; // Default to 0 if undefined
        if (input !== 0) {
            hasInput = true;
            if (current - input < 0) {
                errorMessage += `Cannot remove ${input} ${coinName} (only ${current} available). `;
                return current; // Return current amount if subtraction fails
            }
            return current - input; // Return new amount
        }
        return current; // Return current amount if input is zero
    };

    updates.platinum = safeSubtract(characterState.platinum, inputCoins.pp, 'Platinum');
    updates.gold = safeSubtract(characterState.gold, inputCoins.gp, 'Gold');
    updates.electrum = safeSubtract(characterState.electrum, inputCoins.ep, 'Electrum');
    updates.silver = safeSubtract(characterState.silver, inputCoins.sp, 'Silver');
    updates.copper = safeSubtract(characterState.copper, inputCoins.cp, 'Copper');
    
    // Re-check hasInput since safeSubtract now only returns the current value on error
    if (inputCoins.pp > 0 || inputCoins.gp > 0 || inputCoins.ep > 0 || inputCoins.sp > 0 || inputCoins.cp > 0) {
         hasInput = true;
    }

    if (hasInput) {
        updateState(updates);
        if (errorMessage) {
            // Update display after state update, then show error/warning
            addRollToHistory('action', `<span class="text-red-400 font-bold">Removal Warning:</span> Some coins were not removed.`);
        } else {
            addRollToHistory('action', `<span class="text-red-400 font-bold">COIN REMOVED.</span> Currency totals updated.`);
        }
    }
}


/**
 * Clears all coinage to zero.
 */
function handleCoinClear() {
    // NOTE: The original code used window.confirm. Replacing with console log based on best practice.
    console.log("Confirm clear operation: Are you sure you want to clear ALL your coin amounts? This cannot be undone.");
    
    const updates = {
        platinum: 0,
        gold: 0,
        electrum: 0,
        silver: 0,
        copper: 0
    };
    updateState(updates);
    addRollToHistory('action', `<span class="text-red-400 font-bold">COINAGE CLEARED!</span> All coins reset to 0.`);
}


// --- INVENTORY HANDLERS ---

/**
 * Clears the weapon creation form fields.
 */
function clearWeaponForm() {
    if (ELEMENTS.itemTypeSelect) ELEMENTS.itemTypeSelect.value = '';
    if (ELEMENTS.weaponFormContainer) ELEMENTS.weaponFormContainer.classList.add('hidden');
    if (ELEMENTS.weaponNameInput) ELEMENTS.weaponNameInput.value = '';
    if (ELEMENTS.weaponProficiencySelect) ELEMENTS.weaponProficiencySelect.value = 'Yes';
    if (ELEMENTS.weaponAttackTypeSelect) ELEMENTS.weaponAttackTypeSelect.value = 'Melee';
    if (ELEMENTS.weaponDamageInput) ELEMENTS.weaponDamageInput.value = '';
    if (ELEMENTS.weaponDamageTypeSelect) ELEMENTS.weaponDamageTypeSelect.value = 'Bludgeoning';
    if (ELEMENTS.weaponReachInput) ELEMENTS.weaponReachInput.value = '';
    if (ELEMENTS.weaponWeightInput) ELEMENTS.weaponWeightInput.value = '';
    if (ELEMENTS.weaponCostInput) ELEMENTS.weaponCostInput.value = '';
    if (ELEMENTS.weaponPropertiesInput) ELEMENTS.weaponPropertiesInput.value = '';
    if (ELEMENTS.weaponNotesTextarea) ELEMENTS.weaponNotesTextarea.value = '';
}

/**
 * Clears the armor creation form fields.
 */
function clearArmorForm() {
    if (ELEMENTS.itemTypeSelect) ELEMENTS.itemTypeSelect.value = '';
    if (ELEMENTS.armorFormContainer) ELEMENTS.armorFormContainer.classList.add('hidden');
    if (ELEMENTS.armorNameInput) ELEMENTS.armorNameInput.value = '';
    if (ELEMENTS.armorTypeSelect) ELEMENTS.armorTypeSelect.value = 'Light';
    if (ELEMENTS.armorAcInput) ELEMENTS.armorAcInput.value = '';
    if (ELEMENTS.armorMaxDexInput) ELEMENTS.armorMaxDexInput.value = '0';
    if (ELEMENTS.armorIsProficientSelect) ELEMENTS.armorIsProficientSelect.value = 'Yes';
    if (ELEMENTS.armorWeightInput) ELEMENTS.armorWeightInput.value = '';
    if (ELEMENTS.armorCostInput) ELEMENTS.armorCostInput.value = '';
    if (ELEMENTS.armorStealthDisadvantageSelect) ELEMENTS.armorStealthDisadvantageSelect.value = 'No';
    if (ELEMENTS.armorNotesTextarea) ELEMENTS.armorNotesTextarea.value = '';
}

/**
 * Toggles visibility of item creation forms based on the dropdown selection.
 * @param {string} itemType - The selected item type from the dropdown.
 */
window.handleInventoryFormChange = function(itemType) {
    // FIX: Ensure ELEMENTS object exists and contains the necessary keys
    if (!ELEMENTS.weaponFormContainer || !ELEMENTS.armorFormContainer || !ELEMENTS.otherFormPlaceholder) {
        console.error("DOM Elements for inventory forms are not yet loaded into ELEMENTS object.");
        return; 
    }
    
    ELEMENTS.weaponFormContainer.classList.add('hidden');
    ELEMENTS.armorFormContainer.classList.add('hidden');
    ELEMENTS.otherFormPlaceholder.classList.add('hidden');

    if (itemType === 'Weapon') {
        ELEMENTS.weaponFormContainer.classList.remove('hidden');
    } else if (itemType === 'Armor') {
        ELEMENTS.armorFormContainer.classList.remove('hidden');
    } else if (itemType === 'Other') {
        ELEMENTS.otherFormPlaceholder.classList.remove('hidden');
    }
};

/**
 * Handles saving a new weapon item from the form.
 */
window.addNewWeapon = function() {
    if (!ELEMENTS.weaponNameInput || !ELEMENTS.weaponDamageInput) {
        addRollToHistory('action', `<span class="text-red-500 font-bold">Error:</span> Form elements missing.`);
        return;
    }
    const name = ELEMENTS.weaponNameInput.value.trim();
    const damage = ELEMENTS.weaponDamageInput.value.trim();
    
    if (!name || !damage) {
        addRollToHistory('action', `<span class="text-red-500 font-bold">Error:</span> Weapon Name and Damage fields are required.`);
        return;
    }
    
    const newItem = {
        id: generateUniqueId(),
        type: 'Weapon',
        name: name,
        isEquipped: false, 
        isProficient: ELEMENTS.weaponProficiencySelect.value === 'Yes',
        attackType: ELEMENTS.weaponAttackTypeSelect.value,
        damage: damage,
        damageType: ELEMENTS.weaponDamageTypeSelect.value,
        reach: parseInt(ELEMENTS.weaponReachInput.value) || 5,
        weight: parseFloat(ELEMENTS.weaponWeightInput.value) || 0,
        cost: parseFloat(ELEMENTS.weaponCostInput.value) || 0,
        properties: ELEMENTS.weaponPropertiesInput.value.trim(),
        notes: ELEMENTS.weaponNotesTextarea.value.trim(),
    };

    const updatedInventory = [...characterState.inventory, newItem];
    updateState({ inventory: updatedInventory });
    clearWeaponForm();
    
    addRollToHistory('action', `<span class="text-green-400 font-bold">Weapon Added:</span> ${newItem.name} successfully added.`);
}

/**
 * Handles saving a new armor item from the form.
 */
window.addNewArmor = function() {
    if (!ELEMENTS.armorNameInput || !ELEMENTS.armorAcInput) {
        addRollToHistory('action', `<span class="text-red-500 font-bold">Error:</span> Form elements missing.`);
        return;
    }
    const name = ELEMENTS.armorNameInput.value.trim();
    const ac = parseInt(ELEMENTS.armorAcInput.value);

    if (!name || isNaN(ac) || ac <= 0) {
        addRollToHistory('action', `<span class="text-red-500 font-bold">Error:</span> Armor Name and Base AC are required.`);
        return;
    }
    
    const newItem = {
        id: generateUniqueId(),
        type: 'Armor',
        name: name,
        isEquipped: false,
        ac: ac,
        armorType: ELEMENTS.armorTypeSelect.value,
        maxDex: parseInt(ELEMENTS.armorMaxDexInput.value),
        stealthDisadvantage: ELEMENTS.armorStealthDisadvantageSelect.value === 'Yes',
        isProficient: ELEMENTS.armorIsProficientSelect.value === 'Yes',
        weight: parseFloat(ELEMENTS.armorWeightInput.value) || 0,
        cost: parseFloat(ELEMENTS.armorCostInput.value) || 0,
        notes: ELEMENTS.armorNotesTextarea.value.trim(),
    };

    const updatedInventory = [...characterState.inventory, newItem];
    updateState({ inventory: updatedInventory });
    clearArmorForm();
    
    addRollToHistory('action', `<span class="text-green-400 font-bold">Armor Added:</span> ${newItem.name} successfully added.`);
}


/**
 * Toggles the equipped status of an item (Armor or Weapon).
 * @param {string} itemId - The ID of the item to toggle.
 * @param {string} itemType - The type of item ('Armor' or 'Weapon').
 */
function toggleItemEquipStatus(itemId, itemType) {
    
    let updatedInventory;
    const targetItem = characterState.inventory.find(i => i.id === itemId);
    if (!targetItem) return;
    const newStatus = !targetItem.isEquipped;
    let message;

    if (itemType === 'Armor' && newStatus) {
         // Unequip ALL other armor items if a new one is being equipped
         updatedInventory = characterState.inventory.map(item => {
             if (item.type === 'Armor' && item.id !== itemId) {
                 return { ...item, isEquipped: false };
             }
             return item;
         });
         // Then equip the target item
         updatedInventory = updatedInventory.map(item => item.id === itemId ? { ...item, isEquipped: true } : item);
         message = `<span class="text-green-400 font-bold">ARMOR EQUIPPED!</span> AC updated.`;
         
    } else if (itemType === 'Weapon') {
        // Just toggle the specific weapon
        updatedInventory = characterState.inventory.map(item => item.id === itemId ? { ...item, isEquipped: newStatus } : item);
         message = newStatus
            ? `<span class="text-green-400 font-bold">WEAPON EQUIPPED!</span>`
            : `<span class="text-red-400 font-bold">WEAPON UNEQUIPPED.</span>`;
    } else if (itemType === 'Armor' && !newStatus) {
         // Just unequip the specific armor item
         updatedInventory = characterState.inventory.map(item => item.id === itemId ? { ...item, isEquipped: false } : item);
         message = `<span class="text-red-400 font-bold">ARMOR UNEQUIPPED.</span> AC updated.`;
    } else {
         updatedInventory = characterState.inventory;
         message = `Status change applied.`;
    }
    
    addRollToHistory('action', message);
    updateState({ inventory: updatedInventory });
}

/**
 * Deletes an item from the inventory based on its unique ID.
 * @param {string} itemId - The ID of the item to delete.
 */
function deleteItem(itemId) {
    const itemToDelete = characterState.inventory.find(item => item.id === itemId);
    if (!itemToDelete) return;
    
    const updatedInventory = characterState.inventory.filter(item => item.id !== itemId);
    
    updateState({ inventory: updatedInventory });
    addRollToHistory('action', `<span class="text-red-400 font-bold">Item Deleted:</span> ${itemToDelete.name} removed.`);
}


// --- FEATURE HANDLER FUNCTIONS (Modified to use updateState) ---

function handleGiantsMightActivate() {
    let message = '';
    if (characterState.giantsMightUses > 0 && !characterState.isGiantsMightActive) {
        message = `<span class="text-green-400 font-bold">GIANT'S MIGHT ACTIVATED!</span> Extra 1D6 damage added.`;
        
        updateState({ 
            giantsMightUses: characterState.giantsMightUses - 1,
            isGiantsMightActive: true
        });

    } else if (characterState.isGiantsMightActive) {
        message = `Giant's Might is already <span class="text-green-400 font-bold">ACTIVE!</span>`;
    } else {
        message = `<span class="text-red-400 font-bold">OUT OF USES!</span> Take a Long Rest.`;
    }
    addRollToHistory('action', message);
}

function handleGiantsMightDeactivate() {
    if (characterState.isGiantsMightActive) {
        addRollToHistory('action', `<span class="text-yellow-400 font-bold">GIANT'S MIGHT DEACTIVATED.</span>`);
        updateState({ isGiantsMightActive: false });
    }
}

function handleShortRest() {
    let updates = {};

    if (characterState.cloudRuneUses < 1) updates.cloudRuneUses = 1;
    if (characterState.actionSurgeUses < 1) updates.actionSurgeUses = 1;
	if (characterState.fireRuneUses < 1) updates.fireRuneUses = 1;
    
    if (Object.keys(updates).length > 0) {
        addRollToHistory('action', `<span class="text-indigo-400 font-bold">SHORT REST COMPLETE!</span> Abilities restored.`);
        updateState(updates); 
    } else {
         addRollToHistory('action', `<span class="text-gray-400 font-bold">SHORT REST:</span> No abilities needed restoring.`);
    }
}

function handleLongRest() {
    const maxHp = characterState.maxHp;
    
    updateState({
        currentHp: maxHp,
        tempHp: 0,
        giantsMightUses: 2,
        isGiantsMightActive: false,
        secondWindUses: 3,
        tacticalMindUses: 3,
        fireRuneUses: 1,
        cloudRuneUses: 1,
        actionSurgeUses: 1,
        characterPortrait: characterState.characterPortrait 
    });

    addRollToHistory('action', `<span class="text-blue-400 font-bold">LONG REST COMPLETE!</span> HP and uses restored.`);
}

// Debounced Textarea Change Listeners
const debouncedNotesChange = debounce(() => {
    if (ELEMENTS.notesTextarea) updateState({ notesContent: ELEMENTS.notesTextarea.value });
}, 500);

const debouncedOriginStoryChange = debounce(() => {
    if (ELEMENTS.originStoryTextarea) updateState({ background: { ...characterState.background, story: ELEMENTS.originStoryTextarea.value } });
}, 500);

// --- HP HANDLER FUNCTIONS (Unchanged) ---

function handleHpChange(event) {
    let newHP, newTempHP;
    
    if (event.target === ELEMENTS.currentHpInput) {
        try {
            newHP = parseInt(ELEMENTS.currentHpInput.value, 10);
            const maxHp = characterState.maxHp;

            if (isNaN(newHP) || newHP < 0) newHP = 0; 
            if (newHP > maxHp) newHP = maxHp; 
            
            if (newHP !== characterState.currentHp) {
                updateState({ currentHp: newHP }); 
            }
        } catch (e) {
            console.error("Error validating HP:", e);
        }
    } else if (event.target === ELEMENTS.tempHpInput) {
         try {
            newTempHP = parseInt(ELEMENTS.tempHpInput.value, 10);
            if (isNaN(newTempHP) || newTempHP < 0) newTempHP = 0;
            
            if (newTempHP !== characterState.tempHp) {
                updateState({ tempHp: newTempHP });
            }
         } catch (e) {
             console.error("Error validating Temp HP:", e);
         }
    }
}

function handleHpPlus() {
    let newHP = characterState.currentHp + 1;
    const maxHp = characterState.maxHp;
    
    if (newHP > maxHp) newHP = maxHp;
    
    updateState({ currentHp: newHP });
}

function handleHpMinus() {
    let newHP = characterState.currentHp - 1;
    
    if (newHP < 0) newHP = 0;
    
    updateState({ currentHp: newHP });
}


// --- NEW: ROLL HISTORY FUNCTIONS ---

/**
 * Updates the roll display and button states for a history type.
 */
function updateHistoryDisplay(type) {
    let historyArray, displayElement, backButton, forwardButton, currentIndex;

    if (type === 'skill') {
        historyArray = skillRollHistory;
        displayElement = ELEMENTS.skillRollDisplay;
        backButton = ELEMENTS.skillHistoryBack;
        forwardButton = ELEMENTS.skillHistoryForward;
        currentIndex = currentSkillHistoryIndex;
    } else if (type === 'save') {
        historyArray = saveRollHistory;
        displayElement = ELEMENTS.saveRollDisplay;
        backButton = ELEMENTS.saveHistoryBack;
        forwardButton = ELEMENTS.saveHistoryForward;
        currentIndex = currentSaveHistoryIndex;
    } else { // action
        historyArray = actionRollHistory;
        displayElement = ELEMENTS.actionRollDisplay;
        backButton = ELEMENTS.actionHistoryBack;
        forwardButton = ELEMENTS.actionHistoryForward;
        currentIndex = currentActionHistoryIndex;
    }

    if (!displayElement || !backButton || !forwardButton) return; // Exit if history elements aren't loaded

    if (historyArray.length === 0 || currentIndex === -1 || currentIndex >= historyArray.length) {
        displayElement.innerHTML = "Roll Result";
        if(historyArray.length === 0) {
            backButton.disabled = true;
            forwardButton.disabled = true;
        }
    } else {
        displayElement.innerHTML = historyArray[currentIndex];
    }

    // Update button states
    backButton.disabled = (currentIndex <= 0);
    forwardButton.disabled = (currentIndex >= historyArray.length - 1);
}

/**
 * Adds a new roll to the specified history array and updates the display.
 */
function addRollToHistory(type, rollHtml) {
    if (type === 'skill') {
        skillRollHistory.push(rollHtml);
        currentSkillHistoryIndex = skillRollHistory.length - 1;
        updateHistoryDisplay('skill');
    } else if (type === 'save') {
        saveRollHistory.push(rollHtml);
        currentSaveHistoryIndex = saveRollHistory.length - 1;
        updateHistoryDisplay('save');
    } else { // action
        actionRollHistory.push(rollHtml);
        currentActionHistoryIndex = actionRollHistory.length - 1;
        updateHistoryDisplay('action');
    }
}

/**
 * Handles clicks for all history navigation buttons.
 */
function handleHistoryNavigation(type, direction) {
    if (type === 'skill') {
        if (direction === 'back' && currentSkillHistoryIndex > 0) {
            currentSkillHistoryIndex--;
        } else if (direction === 'forward' && currentSkillHistoryIndex < skillRollHistory.length - 1) {
            currentSkillHistoryIndex++;
        }
        updateHistoryDisplay('skill');
    } else if (type === 'save') {
        if (direction === 'back' && currentSaveHistoryIndex > 0) {
            currentSaveHistoryIndex--;
        } else if (direction === 'forward' && currentSaveHistoryIndex < saveRollHistory.length - 1) {
            currentSaveHistoryIndex++;
        }
        updateHistoryDisplay('save');
    } else { // action
        if (direction === 'back' && currentActionHistoryIndex > 0) {
            currentActionHistoryIndex--;
        } else if (direction === 'forward' && currentActionHistoryIndex < actionRollHistory.length - 1) {
            currentActionHistoryIndex++;
        }
        updateHistoryDisplay('action');
    }
}

// --- ROLL LOGIC (Modified) ---

function rollD20() { return Math.floor(Math.random() * 20) + 1; }

/**
 * Generic D&D Save Roll.
 */
function handleSaveRoll(event) {
    const saveElement = event.target.closest('.save-rollable');
    if (!saveElement) return;

    const saveName = saveElement.dataset.saveName;
    let modifier = parseInt(saveElement.dataset.modifier, 10);
    const rollType = 'normal'; // Assume normal roll unless specific feature applies

    let resultText = '';
    
    const roll = rollD20();
    const total = roll + modifier;
    
    let rollColor = 'text-yellow-300';
    if (roll === 20) rollColor = 'text-green-400 font-bold';
    if (roll === 1) rollColor = 'text-red-400 font-bold';

    resultText = `<span class="${rollColor}">${saveName}: [${roll}] + ${modifier} = ${total}</span>`;

    addRollToHistory('save', resultText);
}

/**
 * Generic D&D Skill Roll.
 */
function handleSkillRoll(event) {
    const skillElement = event.target.closest('.skill-rollable');
    if (!skillElement) return; 

    const skillName = skillElement.dataset.skillName;
    const modifier = parseInt(skillElement.dataset.modifier, 10);
    const rollType = skillElement.dataset.rollType;

    let resultText = '';

    if (rollType === 'normal') {
        const roll = rollD20();
        const total = roll + modifier;
        resultText = `${skillName}: [${roll}] + ${modifier} = ${total}`;
    } else if (rollType === 'advantage') {
        const roll1 = rollD20();
        const roll2 = rollD20();
        const highRoll = Math.max(roll1, roll2);
        const total = highRoll + modifier;
        resultText = `<span class="text-green-400">${skillName} (Adv)</span>: [${roll1}, ${roll2}] &rarr; ${highRoll} + ${modifier} = ${total}`;
    } else if (rollType === 'disadvantage') {
        const roll1 = rollD20();
        const roll2 = rollD20();
        const lowRoll = Math.min(roll1, roll2);
        const total = lowRoll + modifier;
        resultText = `<span class="text-red-400">${skillName} (Dis)</span>: [${roll1}, ${roll2}] &rarr; ${lowRoll} + ${modifier} = ${total}`;
    }

    addRollToHistory('skill', resultText);
}

/**
 * Generic Dice Roll Logic
 */
function handleGenericRoll(dieSize) {
    const roll = Math.floor(Math.random() * dieSize) + 1;
    let resultText = `<span class="text-white">D${dieSize} Roll: [${roll}]</span>`;

    if (dieSize === 20) {
        if (roll === 20) {
            resultText = `<span class="text-green-400 font-bold">D20 Crit: [20]</span>`;
        } else if (roll === 1) {
            resultText = `<span class="text-red-400 font-bold">D20 Fail: [1]</span>`;
        }
    }
    
    addRollToHistory('skill', resultText);
}

/**
 * Damage Roll Logic (handles crits, GWF, Giant's Might, and ability modifier application).
 * @param {string} rollString - Dice string (e.g., '1d12+1d4').
 * @param {boolean} isCrit - True if the roll is a critical hit.
 * @param {boolean} isGWF - True if Great Weapon Fighting applies.
 * @param {string} attackType - 'Melee' or 'Ranged'.
 * @param {number} damageMod - The ability modifier to apply once (e.g., STR_MODIFIER: 5).
 */
function rollDamage(rollString, isCrit = false, isGWF = false, attackType = 'Melee', damageMod = 0) {
    let total = 0;
    let rolls = [];
    
    // 1. Separate dice parts from static modifier
    let diceParts = rollString.split('+').map(p => p.trim());
    let staticModifier = 0; 
    
    // 2. Conditional Dice Addition
    if (characterState.isGiantsMightActive && isGWF) {
        // Giant's Might bonus die is always 1d6
        diceParts.push('1d6 (GM)');
    }

    for (const part of diceParts) {
        if (part.includes('d')) {
            const isGMDie = part.includes('(GM)');
            const rawPart = part.replace(/\s\(GM\)/g, '');
            const [numDice, numSides] = rawPart.split('d').map(Number);
            
            if (isNaN(numDice) || isNaN(numSides)) continue; 

            let partTotal = 0;
            let partRolls = [];
            
            // GWF applies to all dice in a damage roll if the weapon is heavy
            const appliesGWF = isGWF; 
            
            // Dice are doubled on a critical hit
            let numDiceToRoll = isCrit ? numDice * 2 : numDice; 

            for (let i = 0; i < numDiceToRoll; i++) {
                const rawRoll = Math.floor(Math.random() * numSides) + 1;
                let effectiveRoll = rawRoll;
                let labels = '';
                let colorClass = 'text-white';
                
                // 1. GWF Check (reroll 1s and 2s if eligible)
                if (appliesGWF && (rawRoll === 1 || rawRoll === 2)) {
                    effectiveRoll = 3; 
                    labels += ' (GWF)';
                }
                
                // 2. Cosmetic Labeling and Roll Display Construction
                if (numSides === 4 && rawPart.includes('1d4')) {
                    labels += ' (Fire)';
                    colorClass = 'text-red-400';
                }
                if (isGMDie) {
                    labels += ' (GM)';
                    colorClass = 'text-purple-400';
                }
                // Special color for main weapon dice if GWF applied
                if (labels.includes('(GWF)') && !isGMDie && !labels.includes('(Fire)')) {
                    colorClass = 'text-green-400';
                }

                let rollDisplay;
                if (effectiveRoll === 3 && labels.includes('(GWF)')) {
                    rollDisplay = `${rawRoll} &rarr; 3${labels}`;
                } else {
                    rollDisplay = `${rawRoll}${labels}`;
                }
                
                partRolls.push(`<span class="${colorClass}">${rollDisplay}</span>`);
                partTotal += effectiveRoll;
            }
            total += partTotal;
            rolls.push(`[${partRolls.join(', ')}]`);
        } else {
            // Static number (e.g., +1 from an enchantment)
            const modifier = parseInt(part, 10);
            if (!isNaN(modifier)) {
                staticModifier += modifier;
            }
        }
    }
    
    // 3. Final calculation: Dice Total + Ability Modifier (applied once) + Static Modifier
    const finalTotal = total + damageMod + staticModifier;
    
    // 4. Build final roll string output for display
    if (damageMod !== 0) {
         rolls.push(damageMod > 0 ? damageMod.toString() : `(${damageMod.toString()})`);
    }
    if (staticModifier !== 0) {
         rolls.push(staticModifier.toString());
    }

    return { total: finalTotal, rollsString: rolls.join(' + ') };
}

/**
 * Hit Roll Logic
 */
function rollHit(rollString) {
    let modifier = 0;
    let rawRoll = rollD20();
    let parts = rollString.split('+');

    if (parts.length > 1) {
        modifier = parseInt(parts[1], 10) || 0;
    }

    let total = rawRoll + modifier;
    let rollsString = `[${rawRoll}] + ${modifier}`;

    return { total, rawRoll, rollsString };
}

/**
 * Main Action Roll Handler
 */
 function handleActionRoll(event) {
	 const rollButton = event.target.closest('.action-roll-button');
    if (!rollButton) return; 

    const rollString = rollButton.dataset.roll;
    const rollName = rollButton.dataset.rollName;
    const rollType = rollButton.dataset.rollType;
    const card = rollButton.closest('.action-card');
    
    // Data attributes required for damage calculation
    const attackType = rollButton.dataset.attackType || 'Melee';
    const isGWF = rollButton.dataset.isGwf === 'true'; 
    const damageMod = parseInt(rollButton.dataset.damageMod) || 0;

    // Clear crit from other cards
    document.querySelectorAll('.action-card.crit').forEach(otherCard => {
        if (otherCard !== card) {
            otherCard.classList.remove('crit');
        }
    });

    let updates = {};
    let displayMessage = '';

    switch (rollType) {
        case 'hit':
            const { total: hitTotal, rawRoll, rollsString: hitRolls } = rollHit(rollString);
            if (rawRoll === 20) {
                displayMessage = `<span class="text-yellow-300 font-bold">CRITICAL HIT!</span> ${rollName}: ${hitRolls} = <span class="text-white text-lg">${hitTotal}</span>`;
                if(card) card.classList.add('crit');
            } else if (rawRoll === 1) {
                displayMessage = `<span class="text-red-500 font-bold">Critical Fail!</span> ${rollName}: ${hitRolls} = <span class="text-white text-lg">${hitTotal}</span>`;
                if(card) card.classList.remove('crit'); 
            } else {
                displayMessage = `${rollName}: ${hitRolls} = <span class="text-white text-lg">${hitTotal}</span>`;
                if(card) card.classList.remove('crit'); 
            }
            break;

        case 'damage':
            const isCrit = card && card.classList.contains('crit'); 
            // Pass dynamic damage modifier
            const { total: dmgTotal, rollsString: dmgRolls } = rollDamage(rollString, isCrit, isGWF, attackType, damageMod); 

            displayMessage = `${isCrit ? '<span class="text-yellow-300 font-bold">CRIT!</span> ' : ''}${rollName}: ${dmgRolls} = <span class="text-white text-lg">${dmgTotal}</span>`;
            if (card) card.classList.remove('crit');
            break;
            
        case 'damage-rune':
            if (characterState.fireRuneUses > 0) {
                 const isRuneCrit = card && card.classList.contains('crit');
                 // For rune damage, we don't apply the ability modifier
                 const { total: runeDmgTotal, rollsString: runeDmgRolls } = rollDamage(rollString, isRuneCrit, false, 'Melee', 0); 
                 
                 updates.fireRuneUses = characterState.fireRuneUses - 1;

                 displayMessage = `<span class="text-red-400 font-bold">FIRE RUNE DAMAGE:</span> ${runeDmgRolls} = <span class="text-white text-lg">${runeDmgTotal}</span>`;
                 if (card) card.classList.remove('crit');
            } else {
                displayMessage = `<span class="text-red-400 font-bold">FIRE RUNE USED UP.</span> Resets on Long Rest.`;
            }
            break;

        case 'heal':
            if (characterState.secondWindUses > 0) {
                // For heal, the rollString is 1d10+4, so the ability mod (+4) is part of static damage in rollDamage.
                const { total: healAmount, rollsString: healRolls } = rollDamage(rollString, false, false, 'Melee', 0); 
                const newHP = Math.min(characterState.currentHp + healAmount, characterState.maxHp);
                
                updates.secondWindUses = characterState.secondWindUses - 1;
                updates.currentHp = newHP;

                displayMessage = `${rollName}: ${healRolls} = <span class="text-green-400 text-lg">${healAmount} HP Healed (New HP: ${newHP})</span>`;
            } else {
                displayMessage = `<span class="text-red-400 font-bold">SECOND WIND USED UP.</span> Resets on Long Rest.`;
            }
            break;

        case 'roll':
            if (characterState.tacticalMindUses > 0) {
                // Roll is 1d10, no ability mod, no crit
                const { total: bonus, rollsString: bonusRolls } = rollDamage(rollString, false, false, 'Melee', 0);
                
                updates.tacticalMindUses = characterState.tacticalMindUses - 1;

                displayMessage = `${rollName} Bonus: ${bonusRolls} = <span class="text-white text-lg">${bonus}</span>`;
            } else {
                displayMessage = `<span class="text-red-400 font-bold">TACTICAL MIND USED UP.</span> Resets on Long Rest.`;
            }
            break;

        case 'use-rune':
            if (characterState.cloudRuneUses > 0) {
                updates.cloudRuneUses = characterState.cloudRuneUses - 1;
                displayMessage = `<span class="text-blue-400 font-bold">${rollName} Used!</span> Redirecting attack.`;
            } else {
                displayMessage = `<span class="text-red-400 font-bold">${rollName} USED UP.</span> Resets on Short/Long Rest.`;
            }
            break;

        case 'use-action':
            if (characterState.actionSurgeUses > 0) {
                updates.actionSurgeUses = characterState.actionSurgeUses - 1;
                displayMessage = `<span class="text-yellow-400 font-bold">ACTION SURGE USED!</span> You gain one additional action.`;
            } else {
                displayMessage = `<span class="text-red-400 font-bold">ACTION SURGE USED UP.</span> Resets on Short/Long Rest.`;
            }
            break;

        case 'static':
            // Static damage rolls (Unarmed Strike) still need to include the damage modifier
            const staticTotal = parseInt(rollString) + damageMod;
            const damageModDisplay = damageMod > 0 ? ` + ${damageMod}` : (damageMod < 0 ? ` - ${Math.abs(damageMod)}` : '');
            displayMessage = `${rollName}: <span class="text-white text-lg">${rollString}${damageModDisplay} = ${staticTotal}</span>`;
            if (card) card.classList.remove('crit'); 
            break;
    }
    
    addRollToHistory('action', displayMessage);
    if (Object.keys(updates).length > 0) {
        updateState(updates);
    }
}


// --- NEW APP-LEVEL NAVIGATION ---

/**
 * Shows a top-level app page (Landing, Sheet, or Create) and hides the others.
 * @param {string} pageIdToShow - The ID of the page to display.
 */
function showAppPage(pageIdToShow) {
    // Ensure elements are loaded
    if (!ELEMENTS.pageLanding || !ELEMENTS.pageCharacterSheet || !ELEMENTS.pageCharacterCreation) {
        console.error("App page elements not found in ELEMENTS object.");
        return;
    }

    // Hide all top-level pages
    ELEMENTS.pageLanding.classList.add('hidden');
    ELEMENTS.pageCharacterSheet.classList.add('hidden');
    ELEMENTS.pageCharacterCreation.classList.add('hidden');

    // Show the target page
    const pageToShow = document.getElementById(pageIdToShow);
    if (pageToShow) {
        pageToShow.classList.remove('hidden');
    } else {
        console.error(`Page with ID ${pageIdToShow} not found.`);
        // Default to landing page as a fallback
        ELEMENTS.pageLanding.classList.remove('hidden');
    }
}


// --- CHARACTER SHEET NAVIGATION LOGIC (CRITICAL FIX APPLIED HERE) ---

function handleNavigation(event) {
    const clickedButton = event.target.closest('.nav-button');
    if (!clickedButton) return; 

    const targetPageId = clickedButton.dataset.page;
    
    // Define all internal content page IDs based on the navigation buttons
    const allInternalPages = [
        'page-main', 
        'page-actions', 
        'page-features', 
        'page-background', 
        'page-inventory', 
        'page-notes'
    ];
    
    // 1. Hide ALL internal pages
    allInternalPages.forEach(pageId => {
        const page = document.getElementById(pageId);
        if (page) {
             page.classList.add('hidden');
        } else {
            console.warn(`Internal character sheet page with ID ${pageId} not found.`);
        }
    });

    // 2. Deactivate all buttons
    document.querySelectorAll('.nav-button').forEach(button => {
        button.classList.remove('active');
        // Reset manual style overrides applied by the active class logic
        button.style.borderTopWidth = '4px';
        button.style.borderTopColor = 'transparent';
    });

    // 3. Show the target page
    const targetPage = document.getElementById(targetPageId);
    if (targetPage) {
        targetPage.classList.remove('hidden');
    }

    // 4. Activate the clicked button
    clickedButton.classList.add('active');
    clickedButton.style.borderTopWidth = '4px';
    clickedButton.style.borderTopColor = '#ecc94b'; 
}


// --- SPLASH SCREEN LOGIC (Unchanged) ---

function showMainContent() {
    ELEMENTS.splashScreen.style.opacity = '0';
    setTimeout(() => {
        ELEMENTS.splashScreen.style.display = 'none';
        // This is now the correct place to fade in the content
        ELEMENTS.mainContent.classList.add('loaded');
        // NEW: Show the landing page by default
        showAppPage('page-landing');
    }, 500); 
}

// --- *** START OF NEW CHARACTER EDIT/CREATE LOGIC (Phase 4) *** ---

/**
 * Calculates the proficiency bonus for a given level.
 * @param {number} level - The character's level.
 * @returns {number} The proficiency bonus.
 */
function calculateProficiencyBonus(level) {
    return Math.ceil(level / 4) + 1;
}

/**
 * NEW: Calculates Max HP based on Level and CON modifier. (Fighter/d10 Hit Die assumption)
 */
function calculateMaxHp() {
    if (!ELEMENTS.createCharLevel || !ELEMENTS.createScoreCon || !ELEMENTS.createMaxHp) return; // Safeguard
    
    const level = parseInt(ELEMENTS.createCharLevel.value) || 1;
    const conScore = parseInt(ELEMENTS.createScoreCon.value) || 10;
    const conModifier = calculateModifier(conScore);
    
    let maxHp = 0;
    
    if (level === 1) {
        // Level 1: Max Hit Die (10 for Fighter) + CON Modifier
        maxHp = 10 + conModifier;
    } else {
        // HP at Level 1
        maxHp = 10 + conModifier;
        
        // HP gained from levels 2 up to current level
        const averageRoll = 6; // Standard d10 average for Fighter (5.5 rounded up to 6)
        const levelsToCount = level - 1;
        
        maxHp += levelsToCount * (averageRoll + conModifier);
    }
    
    // Ensure HP is at least 1
    maxHp = Math.max(1, maxHp);

    // Update the UI field
    ELEMENTS.createMaxHp.value = maxHp;
    
    // Lock the field when the HP is automatically calculated
    if (level > 0) {
        ELEMENTS.createMaxHp.setAttribute('readonly', 'true');
        ELEMENTS.createMaxHp.classList.add('bg-gray-900', 'text-gray-400', 'cursor-not-allowed');
    } else {
        ELEMENTS.createMaxHp.removeAttribute('readonly');
        ELEMENTS.createMaxHp.classList.remove('bg-gray-900', 'text-gray-400', 'cursor-not-allowed');
    }
}

/**
 * NEW: Handles auto-checking the correct Saving Throw proficiencies based on the selected Class.
 */
function handleClassChange() {
    if (!ELEMENTS.createCharClass) return; // Safeguard
    
    const selectedClass = ELEMENTS.createCharClass.value;
    const savesToProf = CLASS_TO_SAVES[selectedClass] || [];
    
    // Iterate over all possible saving throws
    const allSaves = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    
    allSaves.forEach(save => {
        const checkbox = document.getElementById(`create-save-prof-${save}`);
        if (checkbox) {
            // Check the box if the save is in the array for the selected class, otherwise uncheck it.
            checkbox.checked = savesToProf.includes(save);
        }
    });
}


/**
 * NEW: Reads all data from the creator form and returns a new character data object.
 * This does NOT include data that isn't on the form (like inventory, notes, etc.)
 * @returns {object} A new character data object based on form values.
 */
function getCharacterDataFromForm() {
    // --- 1. Read Vitals & Core Stats (Safeguarded with optional chaining where needed) ---
    const level = parseInt(ELEMENTS.createCharLevel?.value) || 1;
    const profBonus = calculateProficiencyBonus(level);
    
    const scores = {
        str: parseInt(ELEMENTS.createScoreStr?.value) || 10,
        dex: parseInt(ELEMENTS.createScoreDex?.value) || 10,
        con: parseInt(ELEMENTS.createScoreCon?.value) || 10,
        int: parseInt(ELEMENTS.createScoreInt?.value) || 10,
        wis: parseInt(ELEMENTS.createScoreWis?.value) || 10,
        cha: parseInt(ELEMENTS.createScoreCha?.value) || 10,
    };
    
    const modifiers = {
        str: calculateModifier(scores.str),
        dex: calculateModifier(scores.dex),
        con: calculateModifier(scores.con),
        int: calculateModifier(scores.int),
        wis: calculateModifier(scores.wis),
        cha: calculateModifier(scores.cha),
    };

    // --- 2. Build the new Character State object ---
    const newCharacterData = {
        // Vitals
        name: ELEMENTS.createCharName?.value || "New Character",
        race: ELEMENTS.createCharRace?.value || "Unknown",
        class: ELEMENTS.createCharClass?.value || "Unknown",
        level: level,
        proficiencyBonus: profBonus,
        
        // Core Stats
        scores: scores,
        modifiers: modifiers,

        // Combat Stats
        maxHp: parseInt(ELEMENTS.createMaxHp?.value) || 10, // Uses the automatically calculated value
        // *** NOTE: We do NOT update currentHp here, only maxHp ***
        baseAc: parseInt(ELEMENTS.createAc?.value) || 10,
        speed: parseInt(ELEMENTS.createSpeed?.value) || 30,

        // Save Proficiencies
        saveProficiencies: {
            str: ELEMENTS.createSaveProfStr?.checked || false,
            dex: ELEMENTS.createSaveProfDex?.checked || false,
            con: ELEMENTS.createSaveProfCon?.checked || false,
            int: ELEMENTS.createSaveProfInt?.checked || false,
            wis: ELEMENTS.createSaveProfWis?.checked || false,
            cha: ELEMENTS.createSaveProfCha?.checked || false,
        },

        // Skill Proficiencies (Safeguarding all skill lookups)
        skillProficiencies: {
            acrobatics: ELEMENTS.createSkillProfAcrobatics?.checked || false,
            animalhandling: ELEMENTS.createSkillProfAnimalHandling?.checked || false,
            arcana: ELEMENTS.createSkillProfArcana?.checked || false,
            athletics: ELEMENTS.createSkillProfAthletics?.checked || false,
            deception: ELEMENTS.createSkillProfDeception?.checked || false,
            history: ELEMENTS.createSkillProfHistory?.checked || false,
            insight: ELEMENTS.createSkillProfInsight?.checked || false,
            intimidation: ELEMENTS.createSkillProfIntimidation?.checked || false,
            investigation: ELEMENTS.createSkillProfInvestigation?.checked || false,
            medicine: ELEMENTS.createSkillProfMedicine?.checked || false,
            nature: ELEMENTS.createSkillProfNature?.checked || false,
            perception: ELEMENTS.createSkillProfPerception?.checked || false,
            performance: ELEMENTS.createSkillProfPerformance?.checked || false,
            persuasion: ELEMENTS.createSkillProfPersuasion?.checked || false,
            religion: ELEMENTS.createSkillProfReligion?.checked || false,
            sleightofhand: ELEMENTS.createSkillProfSleightOfHand?.checked || false,
            stealth: ELEMENTS.createSkillProfStealth?.checked || false,
            survival: ELEMENTS.createSkillProfSurvival?.checked || false,
        },
        
        // Features (simple storage, logic will be in Phase 4) - Skipped non-existent elements
        features: {
            fightingStyle: "None", 
            feat1: "None",
            feat2: "None",
            runes: {}
        },
        
        // Background - Skipped non-existent elements
        background: {
            name: "Unknown",
            feature: "None",
            story: "",
        },
    };
    
    return newCharacterData;
}

/**
 * NEW: Updates the modifier display for a single ability score field during character creation/edit.
 * @param {string} scoreId - The ID of the score input element (e.g., 'create-score-str').
 * @param {string} modId - The ID of the modifier display element (e.g., 'create-mod-str').
 */
function updateCreationStatDisplay(scoreId, modId) {
    const scoreInput = document.getElementById(scoreId);
    const modDisplay = document.getElementById(modId);
    
    if (scoreInput && modDisplay) {
        const score = parseInt(scoreInput.value) || 0;
        const modifier = calculateModifier(score);
        const prefix = modifier >= 0 ? '+' : '';
        modDisplay.textContent = `${prefix}${modifier}`;
        
        // *** NEW: Trigger HP calculation whenever CON or Level changes ***
        if (scoreId === 'create-score-con' || scoreId === 'create-char-level') {
            calculateMaxHp();
        }
        // *** END NEW ***
    }
}

/**
 * NEW: Convenience function to update all 6 stat displays.
 */
function updateAllCreationStats() {
    updateCreationStatDisplay('create-score-str', 'create-mod-str');
    updateCreationStatDisplay('create-score-dex', 'create-mod-dex');
    updateCreationStatDisplay('create-score-con', 'create-mod-con');
    updateCreationStatDisplay('create-score-int', 'create-mod-int');
    updateCreationStatDisplay('create-score-wis', 'create-mod-wis');
    updateCreationStatDisplay('create-score-cha', 'create-mod-cha');
}

/**
 * NEW: Populates the creation form with data from the active characterState.
 */
function populateCreateForm() {
    const state = characterState;
    
    // Vitals
    if (ELEMENTS.createCharName) ELEMENTS.createCharName.value = state.name;
    if (ELEMENTS.createCharRace) ELEMENTS.createCharRace.value = state.race;
    if (ELEMENTS.createCharClass) ELEMENTS.createCharClass.value = state.class;
    if (ELEMENTS.createCharLevel) ELEMENTS.createCharLevel.value = state.level;
    
    // Scores
    if (ELEMENTS.createScoreStr) ELEMENTS.createScoreStr.value = state.scores.str;
    if (ELEMENTS.createScoreDex) ELEMENTS.createScoreDex.value = state.scores.dex;
    if (ELEMENTS.createScoreCon) ELEMENTS.createScoreCon.value = state.scores.con;
    if (ELEMENTS.createScoreInt) ELEMENTS.createScoreInt.value = state.scores.int;
    if (ELEMENTS.createScoreWis) ELEMENTS.createScoreWis.value = state.scores.wis;
    if (ELEMENTS.createScoreCha) ELEMENTS.createScoreCha.value = state.scores.cha;
    
    // Combat Stats
    if (ELEMENTS.createMaxHp) ELEMENTS.createMaxHp.value = state.maxHp;
    if (ELEMENTS.createAc) ELEMENTS.createAc.value = state.baseAc;
    if (ELEMENTS.createSpeed) ELEMENTS.createSpeed.value = state.speed;
    
    // Save Proficiencies
    for (const [save, isProf] of Object.entries(state.saveProficiencies)) {
        const el = document.getElementById(`create-save-prof-${save}`);
        if (el) el.checked = isProf;
    }
    
    // Skill Proficiencies
    for (const [skill, isProf] of Object.entries(state.skillProficiencies)) {
        const el = document.getElementById(`create-skill-prof-${skill}`);
        if (el) el.checked = isProf;
    }
    
    // Features/Background - Skipping non-existent elements
    
    // Call the live update function to initialize the modifier displays AND calculate HP
    updateAllCreationStats();
    // After populating the class, trigger the save auto-selection
    handleClassChange(); 
}

/**
 * NEW: Clears all fields in the creation form.
 */
function clearCreateForm() {
    // Vitals
    if (ELEMENTS.createCharName) ELEMENTS.createCharName.value = '';
    if (ELEMENTS.createCharRace) ELEMENTS.createCharRace.value = '';
    if (ELEMENTS.createCharClass) ELEMENTS.createCharClass.value = 'Unknown'; // Default the dropdown
    if (ELEMENTS.createCharLevel) ELEMENTS.createCharLevel.value = 1;
    
    // Scores
    if (ELEMENTS.createScoreStr) ELEMENTS.createScoreStr.value = 10;
    if (ELEMENTS.createScoreDex) ELEMENTS.createScoreDex.value = 10;
    if (ELEMENTS.createScoreCon) ELEMENTS.createScoreCon.value = 10;
    if (ELEMENTS.createScoreInt) ELEMENTS.createScoreInt.value = 10;
    if (ELEMENTS.createScoreWis) ELEMENTS.createScoreWis.value = 10;
    if (ELEMENTS.createScoreCha) ELEMENTS.createScoreCha.value = 10;
    
    // Combat Stats
    if (ELEMENTS.createMaxHp) ELEMENTS.createMaxHp.value = 10;
    if (ELEMENTS.createAc) ELEMENTS.createAc.value = 10;
    if (ELEMENTS.createSpeed) ELEMENTS.createSpeed.value = 30;
    
    // Save Proficiencies
    document.querySelectorAll('#page-character-creation input[type="checkbox"]').forEach(el => el.checked = false);
    
    // Reset modifier displays AND calculate initial HP
    updateAllCreationStats();
    handleClassChange(); // Clear/Reset saving throws based on 'Unknown' class
}

/**
 * NEW: Handles clicking the "Edit Character" button.
 */
function handleEditCharacter() {
    isEditMode = true;
    
    // 1. Populate the form with the current character's data
    populateCreateForm();
    
    // 2. Change the page title
    if (ELEMENTS.characterCreationTitle) ELEMENTS.characterCreationTitle.textContent = "Edit Character";
    
    // 3. Show the form page
    showAppPage('page-character-creation');
}

/**
 * REFACTORED: Now only handles saving a BRAND NEW character.
 */
async function handleSaveNewCharacter(newCharacterData) {
    // --- 3. Save to Persistence ---
    if (isLocalMode) {
        // In local mode, we'll just overwrite the single save slot for now
        localPersist.save(newCharacterData, 'local-character');
        console.log("New character saved to LocalStorage.");
        // Manually refresh the list
        initializePersistence(); 
    } else {
        // In Firebase, create a new document in the collection
        const charactersCollectionRef = collection(db, `${DB_PATH}/${userId}/${DB_COLLECTION}`);
        const newCharacterRef = doc(charactersCollectionRef); // Creates a new doc with a unique ID
        
        await setDoc(newCharacterRef, newCharacterData);
        console.log("New character saved to Firestore with ID:", newCharacterRef.id);
    }
}

/**
 * NEW: Handles the logic for the "Save Character" button click.
 * Decides whether to create a new character or update an existing one.
 */
async function handleSaveOrUpdateCharacter() {
    if (!isFirebaseReady && !isLocalMode) {
        alert("Persistence is not ready. Please wait a moment and try again.");
        return;
    }
    
    try {
        // 1. Get all data from the form
        const newCharacterData = getCharacterDataFromForm();

        if (isEditMode) {
            // --- UPDATE EXISTING CHARACTER ---
            
            // 1. Merge the new data with the *existing* state
            // This preserves inventory, notes, current HP, etc.
            const updatedState = { ...characterState, ...newCharacterData };
            
            // 2. Save the merged data back to the *current* characterDocRef
            // The existing `updateState` function is perfect for this!
            updateState(updatedState);
            
            // 3. Navigate back to the character sheet
            alert(`${updatedState.name} has been updated!`);
            showAppPage('page-character-sheet');
            
        } else {
            // --- CREATE NEW CHARACTER ---
            
            // 1. Create the full new character object
            // This includes defaults for things not on the form
            const newCharacterState = {
                ...newCharacterData, // Data from form
                
                // Defaults for new characters
                currentHp: newCharacterData.maxHp, // Full HP
                tempHp: 0,
                inventory: [],
                notesContent: "",
                characterPortrait: EMBEDDED_PORTRAIT_BASE64,
                platinum: 0,
                gold: 0,
                electrum: 0,
                silver: 0,
                copper: 0,
                giantsMightUses: 0,
                isGiantsMightActive: false,
                tacticalMindUses: 0,
                secondWindUses: 0,
                fireRuneUses: 0,
                cloudRuneUses: 0,
                actionSurgeUses: 0,
            };
            
            // 2. Save as a new document
            await handleSaveNewCharacter(newCharacterState);
            
            // 3. Navigate back to landing page
            alert(`${newCharacterState.name} has been saved!`);
            showAppPage('page-landing');
        }

    } catch (e) {
        console.error("Error saving character:", e);
        alert("An error occurred while saving. Please check the console and try again.");
    }
}
// --- *** END OF NEW CHARACTER EDIT/CREATE LOGIC *** ---


// --- MAIN EVENT LISTENER AND INITIALIZATION (Modified Delegation) ---

document.addEventListener('DOMContentLoaded', () => {
    
    // --- *** BEGINNING OF CRITICAL FIX (Corrected document.getElementById syntax) *** ---
    ELEMENTS = {
        // Splash & Main
        splashScreen: document.getElementById('splash-screen'),
        mainContent: document.getElementById('main-content'),
        
        // App-level Pages
        pageLanding: document.getElementById('page-landing'),
        pageCharacterSheet: document.getElementById('page-character-sheet'),
        pageCharacterCreation: document.getElementById('page-character-creation'),
        
        // App-level Navigation Buttons
        characterListContainer: document.getElementById('character-list-container'),
        createCharacterButton: document.getElementById('create-character-button'),
        backToLandingButton: document.getElementById('back-to-landing-button'),
        backToLandingFromCreateButton: document.getElementById('back-to-landing-from-create-button'),
        saveNewCharacterButton: document.getElementById('save-new-character-button'),
        
        // *** NEW ***
        editCharacterButton: document.getElementById('edit-character-button'),
        characterCreationTitle: document.getElementById('character-creation-title'),

        // Character Sheet Elements
        charSheetName: document.getElementById('char-sheet-name'),
        charSheetRace: document.getElementById('char-sheet-race'),
        charSheetClassLevel: document.getElementById('char-sheet-class-level'),
        charSheetProfBonus: document.getElementById('char-sheet-prof-bonus'),
        charSheetSpeed: document.getElementById('char-sheet-speed'),
        backgroundName: document.getElementById('background-name'),
        backgroundFeatureName: document.getElementById('background-feature-name'),
        backgroundFeatureDesc: document.getElementById('background-feature-desc'),
        featuresContainer: document.getElementById('features-container'),
        
        portraitImg: document.getElementById('character-portrait'),
        acDisplay: document.getElementById('ac-display'),

        // HP & Rests
        currentHpInput: document.getElementById('current-hp'),
        maxHpSpan: document.getElementById('max-hp'),
        tempHpInput: document.getElementById('temp-hp'),
        hpPlusButton: document.getElementById('hp-plus-button'),
        hpMinusButton: document.getElementById('hp-minus-button'),
        longRestButton: document.getElementById('long-rest-button'),
        shortRestButton: document.getElementById('short-rest-button'),
        
        // Roll Displays
        skillRollDisplay: document.getElementById('skill-roll-display'),
        actionRollDisplay: document.getElementById('action-roll-display'),
        saveRollDisplay: document.getElementById('save-roll-display'),
        
        // Roll History Buttons
        skillHistoryBack: document.getElementById('skill-history-back'),
        skillHistoryForward: document.getElementById('skill-history-forward'),
        saveHistoryBack: document.getElementById('save-history-back'),
        saveHistoryForward: document.getElementById('save-history-forward'),
        actionHistoryBack: document.getElementById('action-history-back'), 
        actionHistoryForward: document.getElementById('action-history-forward'),
        
        // Actions Page
        actionsListContainer: document.getElementById('actions-list'),
        bonusActionsListContainer: document.getElementById('bonus-actions-list'),
        otherActionsListContainer: document.getElementById('other-actions-list'),
        
        // Currency Elements
        coinPpDisplay: document.getElementById('coin-pp-display'),
        coinGpDisplay: document.getElementById('coin-gp-display'),
        coinEpDisplay: document.getElementById('coin-ep-display'),
        coinSpDisplay: document.getElementById('coin-sp-display'),
        coinCpDisplay: document.getElementById('coin-cp-display'),
        coinPpInput: document.getElementById('coin-pp-input'),
        coinGpInput: document.getElementById('coin-gp-input'),
        coinEpInput: document.getElementById('coin-ep-input'),
        coinSpInput: document.getElementById('coin-sp-input'), 
        coinCpInput: document.getElementById('coin-cp-input'),
        coinAddButton: document.getElementById('coin-add-button'),
        coinRemoveButton: document.getElementById('coin-remove-button'),
        coinClearButton: document.getElementById('coin-clear-button'),
        
        // Inventory Forms & Notes
        inventoryListContainer: document.getElementById('inventory-list-container'),
        itemTypeSelect: document.getElementById('item-type-select'),
        weaponFormContainer: document.getElementById('weapon-form-container'),
        armorFormContainer: document.getElementById('armor-form-container'),
        otherFormPlaceholder: document.getElementById('other-form-placeholder'),
        
        // Weapon Form Inputs
        weaponNameInput: document.getElementById('weapon-name'),
        weaponProficiencySelect: document.getElementById('weapon-proficiency'),
        weaponAttackTypeSelect: document.getElementById('weapon-attack-type'),
        weaponDamageInput: document.getElementById('weapon-damage'),
        weaponDamageTypeSelect: document.getElementById('weapon-damage-type'),
        weaponReachInput: document.getElementById('weapon-reach'),
        weaponWeightInput: document.getElementById('weapon-weight'),
        weaponCostInput: document.getElementById('weapon-cost'),
        weaponPropertiesInput: document.getElementById('weapon-properties'),
        weaponNotesTextarea: document.getElementById('weapon-notes'),
        // Armor Form Inputs
        armorNameInput: document.getElementById('armor-name'),
        armorTypeSelect: document.getElementById('armor-type'),
        armorAcInput: document.getElementById('armor-ac'),
        armorMaxDexInput: document.getElementById('armor-max-dex'),
        armorIsProficientSelect: document.getElementById('armor-is-proficient'),
        armorWeightInput: document.getElementById('armor-weight'),
        armorCostInput: document.getElementById('armor-cost'),
        armorStealthDisadvantageSelect: document.getElementById('armor-stealth-disadvantage'),
        armorNotesTextarea: document.getElementById('armor-notes'),

        notesTextarea: document.getElementById('notes-content-textarea'),
        originStoryTextarea: document.getElementById('origin-story-textarea'),
        
        // *** NAVIGATION FIX STEP 1: Add mainNavigation ***
        mainNavigation: document.getElementById('main-navigation'),
        
        // NEW: Character Creation Form Elements
        createCharName: document.getElementById('create-char-name'),
        createCharRace: document.getElementById('create-char-race'),
        createCharClass: document.getElementById('create-char-class'),
        createCharLevel: document.getElementById('create-char-level'),
        createScoreStr: document.getElementById('create-score-str'),
        createScoreDex: document.getElementById('create-score-dex'),
        createScoreCon: document.getElementById('create-score-con'),
        createScoreInt: document.getElementById('create-score-int'),
        createScoreWis: document.getElementById('create-score-wis'),
        createScoreCha: document.getElementById('create-char-cha'),
        createModStr: document.getElementById('create-mod-str'), 
        createModDex: document.getElementById('create-mod-dex'), 
        createModCon: document.getElementById('create-mod-con'), 
        createModInt: document.getElementById('create-mod-int'), 
        createModWis: document.getElementById('create-mod-wis'), 
        createModCha: document.getElementById('create-mod-cha'), 
        createMaxHp: document.getElementById('create-max-hp'),
        createAc: document.getElementById('create-ac'),
        createSpeed: document.getElementById('create-speed'),
        createSaveProfStr: document.getElementById('create-save-prof-str'),
        createSaveProfDex: document.getElementById('create-save-prof-dex'),
        createSaveProfCon: document.getElementById('create-save-prof-con'),
        createSaveProfInt: document.getElementById('create-save-prof-int'),
        createSaveProfWis: document.getElementById('create-save-prof-wis'),
        createSaveProfCha: document.getElementById('create-save-prof-cha'),
        createSkillProfAcrobatics: document.getElementById('create-skill-prof-acrobatics'),
        createSkillProfAnimalHandling: document.getElementById('create-skill-prof-animalhandling'),
        createSkillProfArcana: document.getElementById('create-skill-prof-arcana'),
        createSkillProfAthletics: document.getElementById('create-skill-prof-athletics'),
        createSkillProfDeception: document.getElementById('create-skill-prof-deception'),
        createSkillProfHistory: document.getElementById('create-skill-prof-history'),
        createSkillProfInsight: document.getElementById('create-skill-prof-insight'),
        createSkillProfIntimidation: document.getElementById('create-skill-prof-intimidation'),
        createSkillProfInvestigation: document.getElementById('create-skill-prof-investigation'),
        createSkillProfMedicine: document.getElementById('create-skill-prof-medicine'),
        createSkillProfNature: document.getElementById('create-skill-prof-nature'),
        createSkillProfPerception: document.getElementById('create-skill-prof-perception'),
        createSkillProfPerformance: document.getElementById('create-skill-prof-performance'),
        createSkillProfPersuasion: document.getElementById('create-skill-prof-persuasion'),
        createSkillProfReligion: document.getElementById('create-skill-prof-religion'),
        createSkillProfSleightOfHand: document.getElementById('create-skill-prof-sleightofhand'),
        createSkillProfStealth: document.getElementById('create-skill-prof-stealth'),
        createSkillProfSurvival: document.getElementById('create-skill-prof-survival'),
    };
    // --- *** END OF CRITICAL FIX *** ---
    
    
    // --- ATTACH EVENT LISTENERS (Optimized using ELEMENT references) ---

    // FIX: Add a reliable, explicit listener for the splash screen now that ELEMENTS is defined
    if (ELEMENTS.splashScreen) ELEMENTS.splashScreen.addEventListener('click', showMainContent);

    // New App-Level Navigation
    if (ELEMENTS.createCharacterButton) ELEMENTS.createCharacterButton.addEventListener('click', () => {
        // *** NEW ***
        isEditMode = false; // Set mode to "create"
        clearCreateForm(); // Clear the form
        if (ELEMENTS.characterCreationTitle) ELEMENTS.characterCreationTitle.textContent = "Create New Character"; // Reset title
        showAppPage('page-character-creation');
    });
    if (ELEMENTS.backToLandingButton) ELEMENTS.backToLandingButton.addEventListener('click', () => {
        showAppPage('page-landing');
    });
    if (ELEMENTS.backToLandingFromCreateButton) ELEMENTS.backToLandingFromCreateButton.addEventListener('click', () => {
        // *** MODIFIED ***
        // If we were editing, go back to the sheet, not the menu
        if (isEditMode) {
            showAppPage('page-character-sheet');
        } else {
            showAppPage('page-landing');
        }
    });
    
    // *** NEW: Edit Character Button (If this element exists, we attach the listener) ***
    if (ELEMENTS.editCharacterButton) ELEMENTS.editCharacterButton.addEventListener('click', handleEditCharacter);
    
    // *** MODIFIED: Save Character Button ***
    // This one button now handles both creating and updating
    if (ELEMENTS.saveNewCharacterButton) ELEMENTS.saveNewCharacterButton.addEventListener('click', handleSaveOrUpdateCharacter);

    // Roll History Navigation (Safeguarded)
    if (ELEMENTS.skillHistoryBack) ELEMENTS.skillHistoryBack.addEventListener('click', () => handleHistoryNavigation('skill', 'back'));
    if (ELEMENTS.skillHistoryForward) ELEMENTS.skillHistoryForward.addEventListener('click', () => handleHistoryNavigation('skill', 'forward'));
    if (ELEMENTS.saveHistoryBack) ELEMENTS.saveHistoryBack.addEventListener('click', () => handleHistoryNavigation('save', 'back'));
    if (ELEMENTS.saveHistoryForward) ELEMENTS.saveHistoryForward.addEventListener('click', () => handleHistoryNavigation('save', 'forward'));
    if (ELEMENTS.actionHistoryBack) ELEMENTS.actionHistoryBack.addEventListener('click', () => handleHistoryNavigation('action', 'back'));
    if (ELEMENTS.actionHistoryForward) ELEMENTS.actionHistoryForward.addEventListener('click', () => handleHistoryNavigation('action', 'forward'));

    // Character Sheet Listeners
    if (ELEMENTS.longRestButton) ELEMENTS.longRestButton.addEventListener('click', handleLongRest);
    if (ELEMENTS.shortRestButton) ELEMENTS.shortRestButton.addEventListener('click', handleShortRest);
    
    // Coinage Action Buttons
    if (ELEMENTS.coinAddButton) ELEMENTS.coinAddButton.addEventListener('click', handleCoinAdd);
    if (ELEMENTS.coinRemoveButton) ELEMENTS.coinRemoveButton.addEventListener('click', handleCoinRemove);
    if (ELEMENTS.coinClearButton) ELEMENTS.coinClearButton.addEventListener('click', handleCoinClear);

    if (ELEMENTS.hpPlusButton) ELEMENTS.hpPlusButton.addEventListener('click', handleHpPlus);
    if (ELEMENTS.hpMinusButton) ELEMENTS.hpMinusButton.addEventListener('click', handleHpMinus);
    
    // The addWeaponButton and addNewArmor buttons call functions directly via onclick in HTML
    
    // Primary Delegate Listener (for all rolls, navigation, and dynamic inventory actions)
    if (ELEMENTS.mainContent) ELEMENTS.mainContent.addEventListener('click', (event) => {
        // Dice Rollers
        const dieButton = event.target.closest('.dice-button-svg');
        if (dieButton) {
            const dieSize = parseInt(dieButton.dataset.die, 10);
            if (dieSize) handleGenericRoll(dieSize);
        }
        
        // Save/Skill Rolls
        if (event.target.closest('.save-rollable')) {
            handleSaveRoll(event);
        }
        if (event.target.closest('.skill-rollable')) {
            handleSkillRoll(event);
        }
        
        // Action Rolls
        if (event.target.closest('.action-roll-button')) {
            // Check for dynamic actions
            if (event.target.id === 'activate-giants-might') {
                handleGiantsMightActivate();
            } else if (event.target.id === 'deactivate-giants-might') {
                handleGiantsMightDeactivate();
            } else {
                handleActionRoll(event);
            }
        }
        
        // Inventory Actions (Equip/Delete)
        const equipButton = event.target.closest('.toggle-equip-btn');
        if (equipButton) {
            const itemId = equipButton.dataset.itemId;
            const itemType = equipButton.dataset.itemType;
            toggleItemEquipStatus(itemId, itemType); 
        }
        const deleteButton = event.target.closest('.delete-item-btn');
        if (deleteButton) {
            const itemId = deleteButton.dataset.itemId;
            deleteItem(itemId);
        }

        // *** NAVIGATION FIX STEP 2: Remove navigation from this listener ***
        // (The .nav-button check that was here has been removed)
    });

    // *** NAVIGATION FIX STEP 3: Add a new, dedicated listener for navigation ***
    if (ELEMENTS.mainNavigation) {
        ELEMENTS.mainNavigation.addEventListener('click', (event) => {
            if (event.target.closest('.nav-button')) {
                handleNavigation(event);
            }
        });
    }

    // HP Change listener (using 'input' for better responsiveness than 'change')
    if (ELEMENTS.mainContent) ELEMENTS.mainContent.addEventListener('input', (event) => {
        if (event.target === ELEMENTS.currentHpInput || event.target === ELEMENTS.tempHpInput) {
            handleHpChange(event);
        }
        
        // *** NEW: Live Ability Score Modifier Update AND Max HP Recalculation ***
        const abilityScoreIds = ['create-score-str', 'create-score-dex', 'create-score-con', 'create-score-int', 'create-score-wis', 'create-score-cha'];
        const stat = abilityScoreIds.find(id => event.target.id === id);
        
        if (stat) {
            const modId = stat.replace('score', 'mod');
            updateCreationStatDisplay(stat, modId);
        } else if (event.target === ELEMENTS.createCharLevel) {
             calculateMaxHp();
        }
        // *** END NEW ***
    });
    
    // *** NEW: Class Change Listener (For Saving Throw Auto-Selection) ***
    if (ELEMENTS.createCharClass) ELEMENTS.createCharClass.addEventListener('change', handleClassChange);
    
    // Textarea listeners (Debounced for performance)
    if (ELEMENTS.notesTextarea) ELEMENTS.notesTextarea.addEventListener('input', debouncedNotesChange); 
    if (ELEMENTS.originStoryTextarea) ELEMENTS.originStoryTextarea.addEventListener('input', debouncedOriginStoryChange);
    
    // --- SET INITIAL UI STATE ---
    
    // Set the default "Main" button to active on load
    const defaultButton = document.querySelector('.nav-button[data-page="page-main"]');
    if (defaultButton) {
        defaultButton.classList.add('active');
        defaultButton.style.borderTopWidth = '4px';
        defaultButton.style.borderTopColor = '#ecc94b';
    }

    // Initialize Persistence logic
    initializePersistence();
});