/**
 * app.js
 * * Contains all the logic for the D&D Character Sheet, including UI interaction, 
 * data persistence (Firebase/Local Storage), dice rolls, and feature tracking.
 * * NOTE: The original code was tightly coupled HTML, CSS, and JS. This file
 * has been restructured to be standalone JavaScript, interacting with the 
 * linked index.html elements via their IDs and classes.
 */

// =========================================================================
// 1. GLOBAL VARIABLES AND ELEMENT MAPPINGS
// =========================================================================

// Firebase Configuration (Must be placed before any Firebase calls)
// NOTE: These placeholder values assume the original code used Firebase.
// The user will need to configure their Firebase project settings here.
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

let database;
let auth;
let characterRef;
let userId = null;
let currentCharacterId = "local_storage_id";
let isFirebaseConnected = false;

// UI Elements - Centralized mapping for easy access
const ELEMENTS = {
    // Main & Header
    appContainer: document.getElementById('app-container'),
    splashScreen: document.getElementById('splash-screen'),
    loginLogoutButton: document.getElementById('login-logout-button'),
    statusAlert: document.getElementById('status-alert'),
    statusMessage: document.getElementById('status-message'),
    characterName: document.getElementById('character-name'),
    raceClassLevel: document.getElementById('race-class-level'),
    mainContent: document.getElementById('main-content'),

    // Navigation
    navButtons: document.querySelectorAll('.nav-button'),
    pageMain: document.getElementById('page-main'),
    pageCombat: document.getElementById('page-combat'),
    pageInventory: document.getElementById('page-inventory'),
    pageFeatures: document.getElementById('page-features'),
    pageNotes: document.getElementById('page-notes'),
    pageOrigin: document.getElementById('page-origin'),

    // Main Stats
    profBonusInput: document.getElementById('prof-bonus-input'),
    acInput: document.getElementById('ac-input'),
    initiativeInput: document.getElementById('initiative-input'),
    speedInput: document.getElementById('speed-input'),
    maxHpInput: document.getElementById('max-hp-input'),
    currentHpInput: document.getElementById('current-hp-input'),
    tempHpInput: document.getElementById('temp-hp-input'),
    hitDiceSizeInput: document.getElementById('hit-dice-size-input'),
    hitDiceCountInput: document.getElementById('hit-dice-count-input'),

    // Ability Scores & Saves
    abilityScoreBoxes: document.querySelectorAll('.ability-score-box'),
    abilityScoreInputs: document.querySelectorAll('.ability-score-input'),
    savingThrows: document.getElementById('saving-throws'),
    saveThrowRows: document.querySelectorAll('.saving-throw-row'),
    
    // Skills
    passivePerception: document.getElementById('passive-perception'),
    passiveInvestigation: document.getElementById('passive-investigation'),
    passiveInsight: document.getElementById('passive-insight'),
    skillsList: document.getElementById('skills-list'),
    skillRows: document.querySelectorAll('.skill-row'),
    
    // Dice Roll Modal
    rollModal: document.getElementById('roll-modal'),
    rollModalTitle: document.getElementById('roll-modal-title'),
    rollModalType: document.getElementById('roll-modal-type'),
    rollModalResult: document.getElementById('roll-modal-result'),
    rollModalBreakdown: document.getElementById('roll-modal-breakdown'),
    rollModalDamageResult: document.getElementById('roll-modal-damage-result'),
    rollModalClose: document.getElementById('roll-modal-close'),
    
    // Death Saves
    deathSaveCheckboxes: document.querySelectorAll('.death-save-checkbox'),

    // Combat
    attacksList: document.getElementById('attacks-list'),
    addAttackForm: document.getElementById('add-attack-form'),
    attackNameInput: document.getElementById('attack-name-input'),
    attackStatInput: document.getElementById('attack-stat-input'),
    attackDamageInput: document.getElementById('attack-damage-input'),
    spellSaveDc: document.getElementById('spell-save-dc'),
    spellAttackBonus: document.getElementById('spell-attack-bonus'),
    spellCastingStatInput: document.getElementById('spell-casting-stat-input'),

    // Inventory
    currencyInputs: document.querySelectorAll('.currency-input'),
    totalWeight: document.getElementById('total-weight'),
    carryingCapacity: document.getElementById('carrying-capacity'),
    encumbranceStatus: document.getElementById('encumbrance-status'),
    addItemForm: document.getElementById('add-item-form'),
    itemNameInput: document.getElementById('item-name-input'),
    itemQuantityInput: document.getElementById('item-quantity-input'),
    itemWeightInput: document.getElementById('item-weight-input'),
    inventoryListTableBody: document.getElementById('inventory-list-table-body'),
    inventoryPlaceholder: document.getElementById('inventory-placeholder'),

    // Features
    addFeatureForm: document.getElementById('add-feature-form'),
    featureNameInput: document.getElementById('feature-name-input'),
    featuresList: document.getElementById('features-list'),
    featuresPlaceholder: document.getElementById('features-placeholder'),
    giantsMightTracker: document.getElementById('giants-might-tracker'),
    giantsMightUses: document.getElementById('giants-might-uses'),
    giantsMightToggle: document.getElementById('giants-might-toggle'),
    giantsMightStatus: document.getElementById('giants-might-status'),
    actionSurgeUses: document.getElementById('action-surge-uses'),
    actionSurgeExpend: document.getElementById('action-surge-expend'),
    runeTrackers: document.getElementById('rune-trackers'),

    // Notes & Origin
    notesTextarea: document.getElementById('notes-textarea'),
    originStoryTextarea: document.getElementById('origin-story-textarea'),
};

// Character Data Model (In-memory representation of the sheet data)
let characterData = {
    // General
    name: '',
    raceClassLevel: '',
    profBonus: 2,
    ac: 10,
    initiative: 0,
    speed: 30,
    // HP & Dice
    maxHp: 10,
    currentHp: 10,
    tempHp: 0,
    hitDiceSize: 'd10',
    hitDiceCount: 1,
    // Ability Scores (STR, DEX, CON, INT, WIS, CHA)
    abilities: {
        STR: 10,
        DEX: 10,
        CON: 10,
        INT: 10,
        WIS: 10,
        CHA: 10,
    },
    // Proficiency (0: None, 1: Proficient, 2: Expertise)
    saves: {
        STR: false,
        DEX: false,
        CON: false,
        INT: false,
        WIS: false,
        CHA: false,
    },
    skills: {
        acrobatics: 0, // DEX
        animalHandling: 0, // WIS
        arcana: 0, // INT
        athletics: 0, // STR
        deception: 0, // CHA
        history: 0, // INT
        insight: 0, // WIS
        intimidation: 0, // CHA
        investigation: 0, // INT
        medicine: 0, // WIS
        nature: 0, // INT
        perception: 0, // WIS
        performance: 0, // CHA
        persuasion: 0, // CHA
        religion: 0, // INT
        sleightOfHand: 0, // DEX
        stealth: 0, // DEX
        survival: 0, // WIS
    },
    // Combat
    attacks: [],
    spellCastingStat: 'None',
    // Inventory
    currency: {
        cp: 0,
        sp: 0,
        ep: 0,
        gp: 0,
        pp: 0,
    },
    inventory: {}, // key: uuid, value: {name, quantity, weight}
    // Features
    features: [], // key: uuid, value: {name, description}
    giantsMightUses: 0,
    giantsMightActive: false,
    actionSurgeUses: 1,
    runes: {
        fire: 1,
        frost: 1,
    },
    // Notes
    notes: '',
    originStory: '',
    // Death Saves
    deathSaves: {
        successes: 0,
        failures: 0
    }
};

// =========================================================================
// 2. UTILITY FUNCTIONS
// =========================================================================

/**
 * Calculates the ability modifier for a given score.
 * @param {number} score 
 * @returns {number} The modifier
 */
const getMod = (score) => Math.floor((score - 10) / 2);

/**
 * Gets the proficiency bonus from the data model.
 * @returns {number} The proficiency bonus
 */
const getProfBonus = () => parseInt(characterData.profBonus) || 0;

/**
 * Formats a number (modifier) to include a '+' sign if positive.
 * @param {number} num 
 * @returns {string} Formatted string
 */
const formatModifier = (num) => (num >= 0 ? `+${num}` : num.toString());

/**
 * Generates a simple, unique ID (for attacks, inventory, features).
 * @returns {string} A unique ID
 */
const generateUniqueId = () => {
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
};

/**
 * Debounce function to limit how often a function is called.
 * Useful for saving data from input events.
 * @param {function} func - The function to debounce
 * @param {number} delay - The delay in milliseconds
 * @returns {function} The debounced function
 */
const debounce = (func, delay) => {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
};

// =========================================================================
// 3. DATA PERSISTENCE (Firebase & Local Storage)
// =========================================================================

/**
 * Initializes Firebase and sets up the listener for authentication state.
 */
const initializePersistence = () => {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        database = firebase.database();
        auth = firebase.auth();
        isFirebaseConnected = true;

        auth.onAuthStateChanged((user) => {
            if (user) {
                // User is signed in (Firebase)
                userId = user.uid;
                characterRef = database.ref(`users/${userId}/characterData`);
                ELEMENTS.loginLogoutButton.textContent = 'Logout';
                ELEMENTS.statusAlert.classList.add('bg-green-800');
                ELEMENTS.statusAlert.classList.remove('bg-red-800');
                ELEMENTS.statusMessage.textContent = 'Status: Connected to Firebase. Data is backed up.';
                showStatusAlert(true);
                loadCharacterData();
            } else {
                // User is signed out (Local Storage)
                userId = null;
                characterRef = null;
                ELEMENTS.loginLogoutButton.textContent = 'Login';
                ELEMENTS.statusAlert.classList.remove('bg-green-800');
                ELEMENTS.statusAlert.classList.add('bg-red-800');
                ELEMENTS.statusMessage.textContent = 'Status: Not logged in. Using Local Storage.';
                showStatusAlert(true);
                loadCharacterData();
            }
        });
    } catch (error) {
        console.error("Firebase initialization failed:", error);
        isFirebaseConnected = false;
        // Fallback to Local Storage only
        ELEMENTS.loginLogoutButton.textContent = 'Login (Disabled)';
        ELEMENTS.loginLogoutButton.disabled = true;
        ELEMENTS.statusAlert.classList.remove('bg-green-800');
        ELEMENTS.statusAlert.classList.add('bg-red-800');
        ELEMENTS.statusMessage.textContent = 'Error: Firebase failed to connect. Using Local Storage.';
        showStatusAlert(true);
        loadCharacterData();
    }
};

/**
 * Displays or hides the status alert with a timeout.
 * @param {boolean} show - Whether to show or hide the alert
 */
const showStatusAlert = (show) => {
    ELEMENTS.statusAlert.classList.remove('hidden');
    ELEMENTS.statusAlert.classList.remove('opacity-0');
    ELEMENTS.statusAlert.classList.add('opacity-100');
    
    if (show) {
        setTimeout(() => {
            ELEMENTS.statusAlert.classList.remove('opacity-100');
            ELEMENTS.statusAlert.classList.add('opacity-0');
            // Hide completely after transition
            setTimeout(() => ELEMENTS.statusAlert.classList.add('hidden'), 300); 
        }, 5000); // Display for 5 seconds
    }
};

/**
 * Authenticates the user using Google popup.
 */
const handleLoginLogout = () => {
    if (userId) {
        // Log out
        auth.signOut();
    } else if (isFirebaseConnected) {
        // Log in
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider)
            .catch((error) => {
                console.error("Login failed:", error);
                alert(`Login Failed: ${error.message}`);
            });
    }
};

/**
 * Saves the character data to Firebase or Local Storage.
 */
const saveCharacterData = () => {
    // 1. Clean the data model (ensure all inputs are correctly parsed)
    // This is especially important for inputs that might store strings but should be numbers.
    const dataToSave = JSON.parse(JSON.stringify(characterData)); // Deep copy

    // 2. Save
    if (userId && characterRef) {
        // Firebase Save
        characterRef.set(dataToSave)
            .catch(error => {
                console.error("Firebase save failed:", error);
                // Optionally alert user
            });
    } else {
        // Local Storage Save
        localStorage.setItem(currentCharacterId, JSON.stringify(dataToSave));
    }
};

// Debounced version of the save function to limit database/storage writes
const debouncedSave = debounce(saveCharacterData, 500);

/**
 * Loads character data from Firebase or Local Storage.
 */
const loadCharacterData = () => {
    const finishLoading = (data) => {
        // Merge loaded data with default structure to prevent missing fields
        characterData = {
            ...characterData, // Default structure
            ...data,         // Overwrite with loaded data
            // Ensure nested objects are also merged correctly if data is very old
            abilities: { ...characterData.abilities, ...(data ? data.abilities : {}) },
            saves: { ...characterData.saves, ...(data ? data.saves : {}) },
            skills: { ...characterData.skills, ...(data ? data.skills : {}) },
            currency: { ...characterData.currency, ...(data ? data.currency : {}) },
            runes: { ...characterData.runes, ...(data ? data.runes : {}) },
            inventory: data && data.inventory ? data.inventory : {},
            attacks: data && data.attacks ? data.attacks : [],
            features: data && data.features ? data.features : [],
            deathSaves: data && data.deathSaves ? data.deathSaves : { successes: 0, failures: 0 },
        };
        
        // 4. Update the UI with the loaded (or default) data
        updateUI();
        
        // 5. Hide splash screen and show the app
        setTimeout(() => {
            ELEMENTS.splashScreen.classList.add('opacity-0');
            ELEMENTS.splashScreen.addEventListener('transitionend', () => {
                ELEMENTS.splashScreen.style.display = 'none';
                ELEMENTS.appContainer.style.display = 'block';
                // Trigger a UI recalculation after display is block
                updateAllCalculatedStats(); 
            }, { once: true });
        }, 500);
    };

    if (userId && characterRef) {
        // Firebase Load
        characterRef.once('value')
            .then((snapshot) => {
                const data = snapshot.val();
                finishLoading(data);
            })
            .catch(error => {
                console.error("Firebase load failed:", error);
                // Fallback to Local Storage on Firebase load failure
                const localData = localStorage.getItem(currentCharacterId);
                finishLoading(localData ? JSON.parse(localData) : {});
            });
    } else {
        // Local Storage Load
        const localData = localStorage.getItem(currentCharacterId);
        finishLoading(localData ? JSON.parse(localData) : {});
    }
};

// =========================================================================
// 4. CORE UI UPDATE AND CALCULATION LOGIC
// =========================================================================

/**
 * Updates all input fields and static displays based on characterData.
 */
const updateUI = () => {
    // General Stats
    ELEMENTS.characterName.value = characterData.name;
    ELEMENTS.raceClassLevel.value = characterData.raceClassLevel;
    ELEMENTS.profBonusInput.value = characterData.profBonus;
    ELEMENTS.acInput.value = characterData.ac;
    ELEMENTS.speedInput.value = characterData.speed;

    // HP & Dice
    ELEMENTS.maxHpInput.value = characterData.maxHp;
    ELEMENTS.currentHpInput.value = characterData.currentHp;
    ELEMENTS.tempHpInput.value = characterData.tempHp;
    ELEMENTS.hitDiceSizeInput.value = characterData.hitDiceSize;
    ELEMENTS.hitDiceCountInput.value = characterData.hitDiceCount;

    // Ability Scores and Saving Throws
    ELEMENTS.abilityScoreBoxes.forEach(box => {
        const ability = box.dataset.ability;
        const scoreInput = box.querySelector('.ability-score-input');
        const modSpan = box.querySelector('.ability-modifier');
        
        // Update input and modifier
        scoreInput.value = characterData.abilities[ability] || 10;
        modSpan.textContent = formatModifier(getMod(characterData.abilities[ability] || 10));
    });

    ELEMENTS.saveThrowRows.forEach(row => {
        const ability = row.dataset.ability;
        const checkbox = row.querySelector('.prof-checkbox');
        
        // Update checkbox state
        checkbox.checked = characterData.saves[ability] || false;
    });

    // Skills
    ELEMENTS.skillRows.forEach(row => {
        const skill = row.dataset.skill.replace(/-/g, ''); // Convert 'animal-handling' to 'animalHandling'
        const select = row.querySelector('.prof-level-select');
        
        // Update select value
        select.value = characterData.skills[skill] || 0;
    });

    // Death Saves
    ELEMENTS.deathSaveCheckboxes.forEach((checkbox, index) => {
        const type = checkbox.dataset.type; // 'success' or 'failure'
        if (type === 'success') {
            checkbox.checked = index < characterData.deathSaves.successes;
        } else {
            checkbox.checked = index < characterData.deathSaves.failures;
        }
    });

    // Combat
    ELEMENTS.spellCastingStatInput.value = characterData.spellCastingStat;
    renderAttacks();

    // Inventory
    renderInventory();
    
    // Currency
    ELEMENTS.currencyInputs.forEach(input => {
        const type = input.id.replace('-input', ''); // 'cp', 'sp', etc.
        input.value = characterData.currency[type] || 0;
    });

    // Features
    renderFeatures();
    
    // Feature Trackers
    ELEMENTS.giantsMightUses.value = characterData.giantsMightUses;
    ELEMENTS.actionSurgeUses.value = characterData.actionSurgeUses;
    // Update Giant's Might UI
    updateGiantsMightUI(characterData.giantsMightActive);
    
    // Runes
    document.querySelectorAll('.rune-tracker').forEach(tracker => {
        const rune = tracker.dataset.rune;
        const usesInput = tracker.querySelector('.rune-uses-input');
        usesInput.value = characterData.runes[rune] || 0;
    });

    // Notes & Origin
    ELEMENTS.notesTextarea.value = characterData.notes;
    ELEMENTS.originStoryTextarea.value = characterData.originStory;

    // Finally, recalculate all derived stats
    updateAllCalculatedStats();
};

/**
 * Calculates and updates all derived stats: Initiative, Saves, Skills, Passive Scores, Encumbrance.
 */
const updateAllCalculatedStats = () => {
    const profBonus = getProfBonus();
    const strScore = characterData.abilities.STR;
    const dexScore = characterData.abilities.DEX;
    const wisScore = characterData.abilities.WIS;
    const strMod = getMod(strScore);
    const dexMod = getMod(dexScore);
    const wisMod = getMod(wisScore);
    
    // --- 1. Initiative ---
    // Initiative is simply DEX modifier
    let initiativeMod = dexMod;
    ELEMENTS.initiativeInput.value = initiativeMod;
    characterData.initiative = initiativeMod;

    // --- 2. Saving Throws ---
    ELEMENTS.saveThrowRows.forEach(row => {
        const ability = row.dataset.ability;
        const abilityScore = characterData.abilities[ability];
        const abilityMod = getMod(abilityScore);
        const isProf = characterData.saves[ability];
        
        let saveMod = abilityMod + (isProf ? profBonus : 0);
        
        // Update the display
        row.querySelector('.save-modifier').textContent = formatModifier(saveMod);
        // Update the roll button data attribute
        row.querySelector('.roll-d20').dataset.rollMod = saveMod;
    });

    // --- 3. Skills ---
    ELEMENTS.skillRows.forEach(row => {
        const skillName = row.dataset.skill.replace(/-/g, '');
        const ability = row.dataset.ability;
        const profLevel = characterData.skills[skillName]; // 0, 1, or 2
        const abilityScore = characterData.abilities[ability];
        const abilityMod = getMod(abilityScore);
        
        let skillMod = abilityMod;
        
        if (profLevel === 1) {
            // Proficient
            skillMod += profBonus;
        } else if (profLevel === 2) {
            // Expertise
            skillMod += (profBonus * 2);
        }
        
        // Update the display
        row.querySelector('.skill-modifier').textContent = formatModifier(skillMod);
        // Update the roll button data attribute
        row.querySelector('.roll-d20').dataset.rollMod = skillMod;
        
        // Update the data model with the calculated skill mod for passive scores
        characterData.skills[skillName + 'Mod'] = skillMod;
    });

    // --- 4. Passive Scores ---
    // Passive Perception = 10 + Perception Mod
    const perceptionMod = characterData.skills.perceptionMod || wisMod; // Use calculated mod or fallback to WIS mod
    const passivePerception = 10 + perceptionMod;
    ELEMENTS.passivePerception.textContent = passivePerception;

    // Passive Investigation = 10 + Investigation Mod
    const investigationMod = characterData.skills.investigationMod || getMod(characterData.abilities.INT); // Use calculated mod or fallback to INT mod
    const passiveInvestigation = 10 + investigationMod;
    ELEMENTS.passiveInvestigation.textContent = passiveInvestigation;

    // Passive Insight = 10 + Insight Mod
    const insightMod = characterData.skills.insightMod || wisMod; // Use calculated mod or fallback to WIS mod
    const passiveInsight = 10 + insightMod;
    ELEMENTS.passiveInsight.textContent = passiveInsight;
    
    // --- 5. Spell Save DC and Attack Bonus ---
    const spellStat = characterData.spellCastingStat;
    let spellMod = 0;
    if (spellStat !== 'None') {
        spellMod = getMod(characterData.abilities[spellStat]);
    }
    
    // Spell Save DC = 8 + Proficiency Bonus + Spellcasting Ability Modifier
    const spellSaveDC = 8 + profBonus + spellMod;
    ELEMENTS.spellSaveDc.textContent = spellSaveDC;

    // Spell Attack Bonus = Proficiency Bonus + Spellcasting Ability Modifier
    const spellAttackBonus = profBonus + spellMod;
    ELEMENTS.spellAttackBonus.textContent = formatModifier(spellAttackBonus);

    // --- 6. Attacks ---
    // This needs to be done after ability mods are calculated
    updateAttackToHits(); 

    // --- 7. Encumbrance ---
    const totalWeight = Object.values(characterData.inventory).reduce((total, item) => {
        return total + (parseFloat(item.weight) || 0) * (parseInt(item.quantity) || 0);
    }, 0);
    const carryingCapacity = strScore * 15; // Capacity is STR * 15
    const encumberedThreshold = strScore * 5;
    const heavilyEncumberedThreshold = strScore * 10;
    
    ELEMENTS.totalWeight.textContent = totalWeight.toFixed(1);
    ELEMENTS.carryingCapacity.textContent = carryingCapacity;

    let statusText = 'Normal';
    let statusColor = 'text-green-400';

    if (totalWeight > heavilyEncumberedThreshold) {
        statusText = 'Heavily Encumbered!';
        statusColor = 'text-red-500';
    } else if (totalWeight > encumberedThreshold) {
        statusText = 'Encumbered';
        statusColor = 'text-yellow-500';
    }

    ELEMENTS.encumbranceStatus.textContent = statusText;
    ELEMENTS.encumbranceStatus.className = `text-center mt-3 text-sm font-semibold ${statusColor}`;

    // Always save after a full calculation cycle
    debouncedSave();
};


// =========================================================================
// 5. EVENT HANDLERS AND LISTENERS
// =========================================================================

/**
 * Handles navigation clicks.
 * @param {Event} event 
 */
const handleNavigation = (event) => {
    const targetButton = event.target.closest('.nav-button');
    if (!targetButton) return;

    const targetPageId = targetButton.dataset.page;

    // 1. Update Navigation Bar UI
    ELEMENTS.navButtons.forEach(button => {
        button.classList.remove('active');
        button.style.borderTopWidth = '0px';
        button.style.borderTopColor = 'transparent';
    });

    targetButton.classList.add('active');
    targetButton.style.borderTopWidth = '4px';
    targetButton.style.borderTopColor = '#ecc94b';

    // 2. Update Content Visibility
    document.querySelectorAll('.page-content').forEach(page => {
        if (page.id === targetPageId) {
            page.classList.remove('hidden');
        } else {
            page.classList.add('hidden');
        }
    });
};

/**
 * Handles changes to any primary input field (name, ability score, AC, etc.)
 * @param {Event} event 
 */
const handleStatInputChange = (event) => {
    const input = event.target;
    let value = input.value;
    const tagName = input.tagName;
    
    // Determine if the value is a number and parse it
    if (input.type === 'number' || input.id.includes('input') || input.className.includes('ability-score-input')) {
        // Strip non-numeric characters for number inputs
        value = parseInt(value) || 0;
        input.value = value;
    }

    // 1. Update the Data Model
    if (input.id === 'character-name') {
        characterData.name = value;
    } else if (input.id === 'race-class-level') {
        characterData.raceClassLevel = value;
    } else if (input.id === 'prof-bonus-input') {
        characterData.profBonus = value;
    } else if (input.id === 'ac-input') {
        characterData.ac = value;
    } else if (input.id === 'speed-input') {
        characterData.speed = value;
    } else if (input.id === 'max-hp-input') {
        characterData.maxHp = value;
        // Don't let current HP exceed max HP
        if (characterData.currentHp > value) {
            characterData.currentHp = value;
            ELEMENTS.currentHpInput.value = value;
        }
    } else if (input.id === 'hit-dice-size-input') {
        characterData.hitDiceSize = value;
    } else if (input.id === 'hit-dice-count-input') {
        characterData.hitDiceCount = value;
    } else if (input.className.includes('currency-input')) {
        const currencyType = input.id.replace('-input', '');
        characterData.currency[currencyType] = value;
    } else if (input.className.includes('ability-score-input')) {
        const abilityBox = input.closest('.ability-score-box');
        const ability = abilityBox.dataset.ability;
        characterData.abilities[ability] = value;
    } else if (input.id === 'spell-casting-stat-input') {
        characterData.spellCastingStat = value;
    } else if (input.id === 'giants-might-uses') {
        characterData.giantsMightUses = value;
    } else if (input.id === 'action-surge-uses') {
        characterData.actionSurgeUses = value;
    } else if (input.className.includes('rune-uses-input')) {
        const runeTracker = input.closest('.rune-tracker');
        const rune = runeTracker.dataset.rune;
        characterData.runes[rune] = value;
    }
    
    // 2. Recalculate and Save
    updateAllCalculatedStats();
};

/**
 * Handles changes to HP inputs, ensuring data integrity.
 * @param {Event} event 
 */
const handleHpChange = (event) => {
    let value = parseInt(event.target.value) || 0;
    
    if (event.target === ELEMENTS.currentHpInput) {
        // Current HP
        // Ensure current HP does not exceed max HP unless it's a temporary effect 
        // that hasn't cleared temp HP yet, but for simplicity:
        if (value > characterData.maxHp && characterData.tempHp === 0) {
            value = characterData.maxHp;
            event.target.value = value;
        }
        characterData.currentHp = value;

        // Apply visual cue for low/high HP (damage/healing)
        if (value <= 0) {
            event.target.classList.add('text-red-600');
            event.target.classList.remove('text-red-400');
        } else if (value < characterData.maxHp / 2) {
            event.target.classList.add('text-red-400');
            event.target.classList.remove('text-red-600');
        } else {
            event.target.classList.remove('text-red-400', 'text-red-600');
            event.target.classList.add('text-white');
        }

    } else if (event.target === ELEMENTS.tempHpInput) {
        // Temporary HP
        characterData.tempHp = value;
    }
    
    debouncedSave();
};

/**
 * Handles checkbox clicks for Saving Throws and Death Saves.
 * @param {Event} event 
 */
const handleCheckboxChange = (event) => {
    const checkbox = event.target;

    if (checkbox.closest('.saving-throw-row')) {
        // Saving Throw Proficiency Change
        const ability = checkbox.closest('.saving-throw-row').dataset.ability;
        characterData.saves[ability] = checkbox.checked;
        updateAllCalculatedStats();
    } else if (checkbox.className.includes('death-save-checkbox')) {
        // Death Save Change
        const type = checkbox.dataset.type; // 'success' or 'failure'
        
        // This is complex because clicking an earlier box should check/uncheck all later ones.
        const allOfType = Array.from(document.querySelectorAll(`.death-save-checkbox[data-type="${type}"]`));
        const index = allOfType.indexOf(checkbox);
        
        // Update all previous checkboxes based on the clicked one
        allOfType.forEach((cb, i) => {
            if (i <= index) {
                cb.checked = checkbox.checked;
            } else if (checkbox.checked) {
                // If checking an earlier box, don't uncheck a later one if it's already checked (this maintains 5e rules)
            } else {
                cb.checked = false;
            }
        });
        
        // Recalculate count
        const count = allOfType.filter(cb => cb.checked).length;
        characterData.deathSaves[`${type}es`] = count;
        
        debouncedSave();
    }
};

/**
 * Handles change of skill proficiency level (select box).
 * @param {Event} event 
 */
const handleSkillProficiencyChange = (event) => {
    const select = event.target;
    const skillRow = select.closest('.skill-row');
    const skillName = skillRow.dataset.skill.replace(/-/g, '');
    
    // Value is 0 (None), 1 (Proficiency), or 2 (Expertise)
    characterData.skills[skillName] = parseInt(select.value);
    
    updateAllCalculatedStats();
};

// Debounced text area handlers
const debouncedNotesChange = debounce(() => {
    characterData.notes = ELEMENTS.notesTextarea.value;
    saveCharacterData();
}, 1000);

const debouncedOriginStoryChange = debounce(() => {
    characterData.originStory = ELEMENTS.originStoryTextarea.value;
    saveCharacterData();
}, 1000);

// =========================================================================
// 6. DICE ROLL LOGIC
// =========================================================================

/**
 * Simulates a single dice roll.
 * @param {number} sides - Number of sides on the die (e.g., 20, 6)
 * @returns {number} The roll result
 */
const rollDice = (sides) => Math.floor(Math.random() * sides) + 1;

/**
 * Parses a damage string (e.g., "2d6+3") and rolls the dice.
 * @param {string} damageString - The damage roll formula
 * @returns {{total: number, breakdown: string}}
 */
const rollDamage = (damageString) => {
    let totalDamage = 0;
    let breakdown = [];
    
    // Regex to find dice rolls (NdN) and modifiers (+N or -N)
    const parts = damageString.match(/(\d*d\d+)|([+-]\s*\d+)/gi);
    
    if (!parts) {
        return { total: 0, breakdown: 'Invalid Damage Formula' };
    }
    
    parts.forEach(part => {
        part = part.trim();
        if (part.includes('d')) {
            // Dice roll (e.g., 2d6)
            const [numDice, sides] = part.split('d').map(n => parseInt(n) || 1);
            let diceRolls = [];
            let diceTotal = 0;
            for (let i = 0; i < numDice; i++) {
                const roll = rollDice(sides);
                diceRolls.push(roll);
                diceTotal += roll;
            }
            totalDamage += diceTotal;
            breakdown.push(`(${diceRolls.join(' + ')})`);
        } else {
            // Modifier (e.g., +3 or -1)
            const modifier = parseInt(part.replace(/\s/g, '')) || 0;
            totalDamage += modifier;
            breakdown.push(`${modifier >= 0 ? '+' : ''}${modifier}`);
        }
    });

    // Simplify the breakdown string by removing the '+' from the first element if it's a modifier
    let finalBreakdown = breakdown.join(' ').replace(/\s\+/, ' + ').trim();
    if (finalBreakdown.startsWith('+')) {
        finalBreakdown = finalBreakdown.substring(1).trim();
    }
    
    return { 
        total: totalDamage, 
        breakdown: finalBreakdown,
    };
};

/**
 * Handles all D20 roll button clicks (Ability, Save, Skill, Attack).
 * @param {Event} event 
 */
const handleD20Roll = (event) => {
    const rollButton = event.target.closest('.roll-d20');
    if (!rollButton) return;

    const rollType = rollButton.dataset.rollType;
    const stat = rollButton.dataset.rollStat;
    let modifier = parseInt(rollButton.dataset.rollMod) || 0;
    let damageRollFormula = rollButton.dataset.damageRoll;

    // Special handling for ability checks (they don't have rollMod pre-set on buttons, so we calculate here)
    if (rollType === 'ability') {
        modifier = getMod(characterData.abilities[stat] || 10);
    }

    // 1. Roll the D20
    const d20Roll = rollDice(20);
    const totalResult = d20Roll + modifier;

    let titleText = '';
    let typeText = '';
    let breakdownText = `Roll: ${d20Roll} ${formatModifier(modifier)} = **${totalResult}**`;
    let damageResultText = '';
    
    // 2. Set Modal Content
    switch (rollType) {
        case 'ability':
            titleText = `${stat} Ability Check`;
            typeText = `Rolling d20 + ${stat} Modifier:`;
            break;
        case 'save':
            titleText = `${stat} Saving Throw`;
            typeText = `Rolling d20 + ${stat} Save Bonus:`;
            break;
        case 'skill':
            const skillName = stat.charAt(0).toUpperCase() + stat.slice(1).replace(/([A-Z])/g, ' $1');
            titleText = `${skillName} Check`;
            typeText = `Rolling d20 + ${skillName} Bonus:`;
            break;
        case 'attack':
            titleText = `${rollButton.closest('.attack-card').querySelector('.attack-name').textContent} Attack Roll`;
            typeText = `Rolling d20 + To Hit Bonus:`;
            
            // Critical Hit/Miss detection for attack rolls
            if (d20Roll === 20) {
                breakdownText += ' - **CRITICAL HIT!**';
            } else if (d20Roll === 1) {
                breakdownText += ' - **CRITICAL MISS!**';
            }
            
            // Damage Roll (if formula exists)
            if (damageRollFormula) {
                // If critical hit, double the dice before adding fixed modifier
                let damageResult;
                if (d20Roll === 20) {
                    const doubledDiceFormula = damageRollFormula.replace(/(\d*)d(\d+)/g, (match, p1, p2) => {
                        const numDice = parseInt(p1 || 1);
                        return (numDice * 2) + 'd' + p2;
                    });
                    damageResult = rollDamage(doubledDiceFormula);
                    damageResultText = `CRIT DAMAGE: **${damageResult.total}**<br><span class="text-xs">(${damageResult.breakdown})</span>`;
                } else {
                    damageResult = rollDamage(damageRollFormula);
                    damageResultText = `DAMAGE: **${damageResult.total}**<br><span class="text-xs">(${damageResult.breakdown})</span>`;
                }
                
                // Show damage result in modal
                ELEMENTS.rollModalDamageResult.classList.remove('hidden');
            }
            break;
        case 'custom':
            // Add custom dice roll logic here if needed (e.g., 4d6 drop lowest)
            titleText = 'Custom Roll';
            typeText = 'Rolling a D20:';
            break;
        default:
            return; // Exit if roll type is unknown
    }
    
    // 3. Populate and Display Modal
    ELEMENTS.rollModalTitle.textContent = titleText;
    ELEMENTS.rollModalType.textContent = typeText;
    ELEMENTS.rollModalResult.textContent = totalResult;
    ELEMENTS.rollModalBreakdown.innerHTML = breakdownText;
    ELEMENTS.rollModalDamageResult.innerHTML = damageResultText;

    // Show modal with animation
    ELEMENTS.rollModal.classList.remove('hidden');
    // Force reflow to ensure transition runs
    void ELEMENTS.rollModal.offsetWidth; 
    ELEMENTS.rollModal.classList.remove('opacity-0');
    ELEMENTS.rollModal.querySelector('div').classList.remove('scale-95');
    ELEMENTS.rollModal.querySelector('div').classList.add('scale-100');
};

/**
 * Closes the dice roll modal.
 */
const closeRollModal = () => {
    // Hide modal with reverse animation
    ELEMENTS.rollModal.classList.add('opacity-0');
    ELEMENTS.rollModal.querySelector('div').classList.remove('scale-100');
    ELEMENTS.rollModal.querySelector('div').classList.add('scale-95');

    ELEMENTS.rollModal.addEventListener('transitionend', () => {
        ELEMENTS.rollModal.classList.add('hidden');
        ELEMENTS.rollModalDamageResult.classList.add('hidden');
    }, { once: true });
};

// =========================================================================
// 7. COMBAT LOGIC (Attacks)
// =========================================================================

/**
 * Renders the current list of attacks to the UI.
 */
const renderAttacks = () => {
    ELEMENTS.attacksList.innerHTML = '';
    
    if (characterData.attacks.length === 0) {
        ELEMENTS.attacksList.innerHTML = '<p class="text-gray-400 text-center italic">No attacks added yet.</p>';
        return;
    }

    characterData.attacks.forEach(attack => {
        const attackElement = document.createElement('div');
        attackElement.className = 'attack-card bg-gray-700 p-3 rounded-md flex justify-between items-center border border-gray-500 hover:border-yellow-400 transition duration-150 ease-in-out';
        attackElement.dataset.attackId = attack.id;

        // Calculate To-Hit Bonus
        let toHitMod = 0;
        if (attack.stat === 'Custom') {
            // Placeholder for a true custom bonus input if implemented
            toHitMod = 0; 
        } else if (characterData.abilities[attack.stat]) {
            const abilityMod = getMod(characterData.abilities[attack.stat]);
            const profBonus = getProfBonus();
            toHitMod = abilityMod + profBonus;
        }
        
        // Save the calculated mod to the attack object for persistence and updateAttackToHits
        attack.toHitMod = toHitMod;
        
        attackElement.innerHTML = `
            <span class="attack-name text-lg font-semibold w-1/4 truncate">${attack.name}</span>
            <div class="flex items-center space-x-4 w-3/4 justify-end">
                <span class="attack-to-hit text-lg font-bold w-1/5 text-center">${formatModifier(toHitMod)}</span>
                <span class="attack-damage text-lg w-2/5 text-center">${attack.damage}</span>
                <button class="roll-button bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded roll-d20 w-1/5 transition duration-150 ease-in-out" 
                        data-roll-type="attack" 
                        data-roll-stat="${attack.stat}" 
                        data-roll-mod="${toHitMod}"
                        data-damage-roll="${attack.damage}">
                    Attack
                </button>
                <button class="delete-attack-button text-red-400 hover:text-red-500 transition duration-150 ease-in-out" data-attack-id="${attack.id}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;

        ELEMENTS.attacksList.appendChild(attackElement);
    });
};

/**
 * Updates the To-Hit bonus displayed on attack cards when ability scores or prof bonus changes.
 */
const updateAttackToHits = () => {
    // Re-calculate the toHitMod for each attack in the data model and update the UI
    characterData.attacks.forEach(attack => {
        let toHitMod = 0;
        if (attack.stat === 'Custom') {
            toHitMod = 0; // Placeholder
        } else if (characterData.abilities[attack.stat]) {
            const abilityMod = getMod(characterData.abilities[attack.stat]);
            const profBonus = getProfBonus();
            toHitMod = abilityMod + profBonus;
        }

        attack.toHitMod = toHitMod;
        
        // Update UI elements
        const card = ELEMENTS.attacksList.querySelector(`.attack-card[data-attack-id="${attack.id}"]`);
        if (card) {
            card.querySelector('.attack-to-hit').textContent = formatModifier(toHitMod);
            card.querySelector('.roll-d20').dataset.rollMod = toHitMod;
        }
    });
};

/**
 * Adds a new attack action to the data model and rerenders.
 * @param {Event} event 
 */
const addAttack = (event) => {
    event.preventDefault();
    
    const name = ELEMENTS.attackNameInput.value.trim();
    const stat = ELEMENTS.attackStatInput.value;
    const damage = ELEMENTS.attackDamageInput.value.trim();
    
    if (!name || !stat || !damage) {
        alert('Please fill out all fields for the attack.');
        return;
    }
    
    const newAttack = {
        id: generateUniqueId(),
        name: name,
        stat: stat,
        damage: damage,
    };
    
    characterData.attacks.push(newAttack);
    
    // Clear form
    ELEMENTS.attackNameInput.value = '';
    ELEMENTS.attackStatInput.value = '';
    ELEMENTS.attackDamageInput.value = '';

    renderAttacks();
    debouncedSave();
};

/**
 * Deletes an attack action from the data model and rerenders.
 * @param {string} attackId 
 */
const deleteAttack = (attackId) => {
    characterData.attacks = characterData.attacks.filter(attack => attack.id !== attackId);
    renderAttacks();
    debouncedSave();
};


// =========================================================================
// 8. INVENTORY LOGIC
// =========================================================================

/**
 * Renders the inventory list to the table.
 */
const renderInventory = () => {
    ELEMENTS.inventoryListTableBody.innerHTML = '';
    const inventoryKeys = Object.keys(characterData.inventory);

    if (inventoryKeys.length === 0) {
        ELEMENTS.inventoryListTableBody.appendChild(ELEMENTS.inventoryPlaceholder);
        return;
    }
    
    // Remove placeholder if items exist
    if (ELEMENTS.inventoryPlaceholder.parentNode) {
        ELEMENTS.inventoryPlaceholder.remove();
    }

    inventoryKeys.forEach(itemId => {
        const item = characterData.inventory[itemId];
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-700 transition duration-150 ease-in-out';
        
        row.innerHTML = `
            <td class="px-4 py-2 whitespace-nowrap text-sm font-medium text-white">${item.name}</td>
            <td class="px-4 py-2 whitespace-nowrap text-sm text-center">
                <input type="number" data-item-id="${itemId}" data-field="quantity" value="${item.quantity}" min="1" class="inventory-field-input w-16 text-center bg-gray-600 rounded border border-gray-500 focus:border-yellow-400">
            </td>
            <td class="px-4 py-2 whitespace-nowrap text-sm text-center">
                <input type="number" data-item-id="${itemId}" data-field="weight" value="${item.weight}" min="0" step="0.1" class="inventory-field-input w-20 text-center bg-gray-600 rounded border border-gray-500 focus:border-yellow-400">
            </td>
            <td class="px-4 py-2 whitespace-nowrap text-right text-sm font-medium text-center">
                <button class="delete-item-button text-red-400 hover:text-red-500 transition duration-150 ease-in-out" data-item-id="${itemId}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;

        ELEMENTS.inventoryListTableBody.appendChild(row);
    });

    // Recalculate encumbrance after rendering
    updateAllCalculatedStats(); 
};

/**
 * Adds a new item to the inventory.
 * @param {Event} event 
 */
const addItem = (event) => {
    event.preventDefault();
    
    const name = ELEMENTS.itemNameInput.value.trim();
    const quantity = parseInt(ELEMENTS.itemQuantityInput.value) || 1;
    const weight = parseFloat(ELEMENTS.itemWeightInput.value) || 0;
    
    if (!name) {
        alert('Please enter a name for the item.');
        return;
    }
    
    const newItem = {
        name: name,
        quantity: quantity,
        weight: weight,
    };
    
    const itemId = generateUniqueId();
    characterData.inventory[itemId] = newItem;
    
    // Clear form
    ELEMENTS.itemNameInput.value = '';
    ELEMENTS.itemQuantityInput.value = 1;
    ELEMENTS.itemWeightInput.value = 0;

    renderInventory();
    debouncedSave();
};

/**
 * Deletes an item from the inventory.
 * @param {string} itemId 
 */
const deleteItem = (itemId) => {
    if (characterData.inventory[itemId]) {
        delete characterData.inventory[itemId];
        renderInventory();
        debouncedSave();
    }
};

/**
 * Handles changes to individual inventory item fields (quantity, weight).
 * @param {Event} event 
 */
const handleInventoryFieldChange = (event) => {
    const input = event.target;
    const itemId = input.dataset.itemId;
    const field = input.dataset.field;
    
    if (!itemId || !field || !characterData.inventory[itemId]) return;

    let value = input.value;
    
    if (field === 'quantity') {
        value = parseInt(value) || 1;
        input.value = Math.max(1, value); // Ensure quantity is at least 1
    } else if (field === 'weight') {
        value = parseFloat(value) || 0;
        input.value = Math.max(0, value); // Ensure weight is non-negative
    }
    
    characterData.inventory[itemId][field] = value;

    updateAllCalculatedStats(); // Triggers encumbrance recalculation and debounced save
};


// =========================================================================
// 9. FEATURES & RESOURCE TRACKING LOGIC
// =========================================================================

/**
 * Renders the general features list.
 */
const renderFeatures = () => {
    ELEMENTS.featuresList.innerHTML = '';
    
    if (characterData.features.length === 0) {
        ELEMENTS.featuresPlaceholder.classList.remove('hidden');
        ELEMENTS.featuresList.appendChild(ELEMENTS.featuresPlaceholder);
        return;
    }
    
    ELEMENTS.featuresPlaceholder.classList.add('hidden');

    characterData.features.forEach(feature => {
        const featureElement = document.createElement('div');
        featureElement.className = 'feature-card bg-gray-700 p-3 rounded-md flex justify-between items-start border border-gray-500';
        
        featureElement.innerHTML = `
            <textarea data-feature-id="${feature.id}" class="feature-name-textarea w-full bg-transparent border-none resize-none focus:outline-none focus:border-yellow-400 p-0" rows="1">${feature.name}</textarea>
            <button class="delete-feature-button text-red-400 hover:text-red-500 transition duration-150 ease-in-out ml-3 flex-shrink-0" data-feature-id="${feature.id}">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;

        // Auto-adjust textarea height
        const textarea = featureElement.querySelector('.feature-name-textarea');
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = (textarea.scrollHeight) + 'px';
            handleFeatureNameChange({target: textarea}); // Save on input
        });
        // Set initial height
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight) + 'px';

        ELEMENTS.featuresList.appendChild(featureElement);
    });
};

/**
 * Adds a new feature to the list.
 * @param {Event} event 
 */
const addFeature = (event) => {
    event.preventDefault();
    
    const name = ELEMENTS.featureNameInput.value.trim();
    
    if (!name) {
        alert('Please enter a feature name.');
        return;
    }
    
    const newFeature = {
        id: generateUniqueId(),
        name: name,
    };
    
    characterData.features.push(newFeature);
    
    // Clear form
    ELEMENTS.featureNameInput.value = '';

    renderFeatures();
    debouncedSave();
};

/**
 * Deletes a feature.
 * @param {string} featureId 
 */
const deleteFeature = (featureId) => {
    characterData.features = characterData.features.filter(feature => feature.id !== featureId);
    renderFeatures();
    debouncedSave();
};

/**
 * Handles in-place editing of feature names via textarea.
 * @param {Event} event 
 */
const handleFeatureNameChange = (event) => {
    const textarea = event.target;
    const featureId = textarea.dataset.featureId;
    
    const feature = characterData.features.find(f => f.id === featureId);
    if (feature) {
        feature.name = textarea.value.trim();
        debouncedSave();
    }
};

// --- Giant's Might Tracker Logic ---

/**
 * Updates the Giant's Might UI based on its active state.
 * @param {boolean} isActive 
 */
const updateGiantsMightUI = (isActive) => {
    if (isActive) {
        ELEMENTS.giantsMightStatus.textContent = 'Status: ACTIVE (Bonus Damage)';
        ELEMENTS.giantsMightStatus.classList.remove('text-gray-400');
        ELEMENTS.giantsMightStatus.classList.add('text-green-400');
        ELEMENTS.giantsMightToggle.textContent = 'Deactivate';
        ELEMENTS.giantsMightToggle.classList.remove('bg-green-500', 'hover:bg-green-600');
        ELEMENTS.giantsMightToggle.classList.add('bg-red-500', 'hover:bg-red-600');
    } else {
        ELEMENTS.giantsMightStatus.textContent = 'Status: Inactive';
        ELEMENTS.giantsMightStatus.classList.remove('text-green-400');
        ELEMENTS.giantsMightStatus.classList.add('text-gray-400');
        ELEMENTS.giantsMightToggle.textContent = 'Activate';
        ELEMENTS.giantsMightToggle.classList.remove('bg-red-500', 'hover:bg-red-600');
        ELEMENTS.giantsMightToggle.classList.add('bg-green-500', 'hover:bg-green-600');
    }
};

/**
 * Toggles the Giant's Might active state and expends a use if activating.
 */
const toggleGiantsMight = () => {
    const currentlyActive = characterData.giantsMightActive;

    if (currentlyActive) {
        // Deactivate
        characterData.giantsMightActive = false;
    } else {
        // Activate (Check uses first)
        if (characterData.giantsMightUses > 0) {
            characterData.giantsMightUses--;
            ELEMENTS.giantsMightUses.value = characterData.giantsMightUses; // Update input directly
            characterData.giantsMightActive = true;
        } else {
            alert("You have no uses of Giant's Might remaining.");
            return;
        }
    }

    updateGiantsMightUI(characterData.giantsMightActive);
    debouncedSave();
};

// --- Action Surge Tracker Logic ---

/**
 * Expends one use of Action Surge.
 */
const expendActionSurge = () => {
    if (characterData.actionSurgeUses > 0) {
        if (confirm("Are you sure you want to expend one use of Action Surge?")) {
            characterData.actionSurgeUses--;
            ELEMENTS.actionSurgeUses.value = characterData.actionSurgeUses;
            debouncedSave();
        }
    } else {
        alert("You have no Action Surge uses remaining.");
    }
};

// --- Rune Tracker Logic ---

/**
 * Expends one use of a specific Rune.
 * @param {Event} event 
 */
const expendRune = (event) => {
    const runeTracker = event.target.closest('.rune-tracker');
    const rune = runeTracker.dataset.rune;
    const usesInput = runeTracker.querySelector('.rune-uses-input');
    
    if (characterData.runes[rune] > 0) {
        if (confirm(`Are you sure you want to expend one use of the ${rune.charAt(0).toUpperCase() + rune.slice(1)} Rune?`)) {
            characterData.runes[rune]--;
            usesInput.value = characterData.runes[rune];
            debouncedSave();
        }
    } else {
        alert(`You have no uses of the ${rune.charAt(0).toUpperCase() + rune.slice(1)} Rune remaining.`);
    }
};

// =========================================================================
// 10. DICE ROLL UI & CUSTOM ROLL LOGIC
// =========================================================================

/**
 * Toggles the visibility of the dice log and custom roll UI.
 */
const toggleRollUI = () => {
    const isVisible = ELEMENTS.customRollUi.classList.contains('hidden') === false;
    
    if (isVisible) {
        ELEMENTS.customRollUi.classList.add('hidden');
        ELEMENTS.diceLog.classList.add('hidden');
    } else {
        ELEMENTS.customRollUi.classList.remove('hidden');
        // Show log only if it has rolls, otherwise, we'll wait for the first roll
        const hasRolls = ELEMENTS.diceLog.children.length > 1 && !document.getElementById('log-placeholder').classList.contains('hidden');
        if (hasRolls) { 
            ELEMENTS.diceLog.classList.remove('hidden');
        }
    }
};

/**
 * Executes a custom dice roll (e.g., 2d6+4).
 */
const handleCustomRoll = () => {
    const count = parseInt(document.getElementById('dice-count-input').value) || 1;
    const size = parseInt(document.getElementById('dice-size-select').value) || 20;
    const modifier = parseInt(document.getElementById('modifier-input').value) || 0;

    let totalRoll = 0;
    let rollDetails = [];
    
    for (let i = 0; i < count; i++) {
        const roll = rollDice(size);
        totalRoll += roll;
        rollDetails.push(roll);
    }
    
    const finalResult = totalRoll + modifier;
    
    // Log the roll
    logRoll(`Custom Roll (${count}d${size}${formatModifier(modifier)}): **${finalResult}**`, 
            `(${rollDetails.join(' + ')}) ${formatModifier(modifier)}`);
};

/**
 * Adds an entry to the dice roll log.
 * @param {string} title 
 * @param {string} breakdown 
 */
const logRoll = (title, breakdown) => {
    // Ensure the placeholder is hidden
    const placeholder = document.getElementById('log-placeholder');
    if (placeholder) {
        placeholder.classList.add('hidden');
    }
    
    const logItem = document.createElement('div');
    logItem.className = 'text-sm mb-1 p-1 border-b border-gray-700 last:border-b-0';
    logItem.innerHTML = `
        <p class="font-semibold text-yellow-400">${title}</p>
        <p class="text-xs text-gray-400">${breakdown}</p>
    `;

    // Insert at the top of the log (after the header, but before existing rolls)
    const logContainer = ELEMENTS.diceLog;
    // The first child is the header (div.flex)
    const firstRoll = logContainer.children[1]; 

    if (firstRoll && !firstRoll.classList.contains('italic')) {
        logContainer.insertBefore(logItem, firstRoll);
    } else {
        // If only the header and placeholder exist
        logContainer.appendChild(logItem);
    }
    
    // Ensure the log is visible
    ELEMENTS.diceLog.classList.remove('hidden');
};

/**
 * Clears all entries from the dice roll log.
 */
const clearRollLog = () => {
    const logContainer = ELEMENTS.diceLog;
    // Keep only the first element (the header/clear button)
    // We start removing from the second element (index 1) to preserve the header
    while (logContainer.children.length > 1) {
        logContainer.removeChild(logContainer.lastChild);
    }
    document.getElementById('log-placeholder').classList.remove('hidden');
    ELEMENTS.diceLog.classList.add('hidden');
};

// =========================================================================
// 11. RESTING LOGIC
// =========================================================================

/**
 * Handles the logic for a Short Rest.
 */
const handleShortRest = () => {
    if (confirm("Are you sure you want to take a Short Rest?")) {
        // Recover short-rest resources
        characterData.actionSurgeUses = 1; 
        characterData.giantsMightUses = 1; 
        characterData.runes.fire = 1;
        characterData.runes.frost = 1;

        // Clear Temporary HP
        characterData.tempHp = 0;

        // Update UI and save
        updateUI();
        alert("Short Rest complete! Resources recovered. Remember to spend Hit Dice manually.");
    }
};

/**
 * Handles the logic for a Long Rest.
 */
const handleLongRest = () => {
    if (confirm("Are you sure you want to take a Long Rest?")) {
        // Full resource recovery
        characterData.actionSurgeUses = 1; 
        characterData.giantsMightUses = 1; 
        characterData.runes.fire = 1;
        characterData.runes.frost = 1;

        // Restore all HP
        characterData.currentHp = characterData.maxHp;
        
        // Clear Temporary HP
        characterData.tempHp = 0;

        // Restore half of maximum Hit Dice (rounded down, min 1)
        const maxLevel = parseInt(characterData.raceClassLevel.match(/\d+/g)?.[0]) || 1; // Attempt to pull level from string
        const restoredHitDice = Math.max(1, Math.floor(maxLevel / 2));
        characterData.hitDiceCount = restoredHitDice; 

        // Clear Death Saves
        characterData.deathSaves.successes = 0;
        characterData.deathSaves.failures = 0;

        // Update UI and save
        updateUI();
        alert("Long Rest complete! HP and resources restored.");
    }
};


// =========================================================================
// 12. INITIALIZATION AND EVENT ATTACHMENT
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    
    // --- ATTACH INPUT LISTENERS (Change/Input) ---
    ELEMENTS.mainContent.addEventListener('change', (event) => {
        const target = event.target;

        if (target.tagName === 'INPUT' && target.type !== 'checkbox' && target.type !== 'radio' && target.type !== 'submit') {
            handleStatInputChange(event);
        } else if (target.tagName === 'SELECT') {
            handleStatInputChange(event);
        } else if (target.className.includes('inventory-field-input')) {
            handleInventoryFieldChange(event);
        } else if (target.className.includes('prof-level-select')) {
            handleSkillProficiencyChange(event);
        }
    });

    // Handle checkboxes (Saving Throws, Death Saves)
    ELEMENTS.mainContent.addEventListener('click', (event) => {
        const target = event.target;
        if (target.type === 'checkbox' || target.type === 'radio') {
            handleCheckboxChange(event);
        }
    });

    // Handle in-place feature name editing (debounced save handled inside handler)
    ELEMENTS.featuresList.addEventListener('input', (event) => {
        if (event.target.className.includes('feature-name-textarea')) {
            // Auto-adjust is handled inside renderFeatures/handleFeatureNameChange (must re-implement auto-adjust outside the debounced save)
            // Note: Auto-adjust logic was not strictly necessary for functionality, only UX.
            handleFeatureNameChange(event);
        }
    });


    // --- ATTACH FORM SUBMISSION LISTENERS (Inventory/Combat) ---
    if (ELEMENTS.addAttackForm) ELEMENTS.addAttackForm.addEventListener('submit', addAttack);
    if (ELEMENTS.addItemForm) ELEMENTS.addItemForm.addEventListener('submit', addItem);
    if (ELEMENTS.addFeatureForm) ELEMENTS.addFeatureForm.addEventListener('submit', addFeature);


    // --- ATTACH CLICK LISTENERS (Buttons & Rolls) ---
    
    // Delegation for various button clicks
    document.addEventListener('click', (event) => {
        const target = event.target;
        
        // Dice Rolls (D20s on sheet)
        if (target.closest('.roll-d20')) {
            handleD20Roll(event);
        }
        
        // Dice Roll Modal Close
        if (target === ELEMENTS.rollModalClose || target === ELEMENTS.rollModal) {
            closeRollModal();
        }

        // Feature Toggles/Expending
        if (target === ELEMENTS.giantsMightToggle) {
            toggleGiantsMight();
        } else if (target === ELEMENTS.actionSurgeExpend) {
            expendActionSurge();
        } else if (target.className.includes('rune-expend-button')) {
            expendRune(event);
        }

        // Rest Buttons (Assuming standard IDs were present in original HTML)
        if (target.id === 'short-rest-button') {
            handleShortRest();
        } else if (target.id === 'long-rest-button') {
            handleLongRest();
        }
        
        // Login/Logout
        if (target === ELEMENTS.loginLogoutButton) {
            handleLoginLogout();
        }

        // Deletion Buttons (Attacks, Inventory, Features)
        const deleteButton = target.closest('.delete-attack-button') || 
                             target.closest('.delete-item-button') ||
                             target.closest('.delete-feature-button');
        if (deleteButton) {
            if (confirm("Are you sure you want to delete this item? This cannot be undone.")) {
                if (deleteButton.className.includes('delete-attack-button')) {
                    deleteAttack(deleteButton.dataset.attackId);
                } else if (deleteButton.className.includes('delete-item-button')) {
                    deleteItem(deleteButton.dataset.itemId);
                } else if (deleteButton.className.includes('delete-feature-button')) {
                    deleteFeature(deleteButton.dataset.featureId);
                }
            }
        }

        // Navigation
        if (target.closest('.nav-button')) {
            handleNavigation(event);
        }
        
        // Dice Log/Custom Roll UI
        if (target === document.getElementById('roll-ui-toggle')) {
            toggleRollUI();
        } else if (target === document.getElementById('submit-custom-roll')) {
            handleCustomRoll();
        } else if (target === document.getElementById('clear-log-button')) {
            clearRollLog();
        }
    });

    // HP Change listener (using 'input' for better responsiveness than 'change')
    ELEMENTS.mainContent.addEventListener('input', (event) => {
        if (event.target === ELEMENTS.currentHpInput || event.target === ELEMENTS.tempHpInput) {
            handleHpChange(event);
        }
    });
    
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

    // Initialize Persistence logic (This is the entry point that calls loadCharacterData and updateUI)
    initializePersistence();
});