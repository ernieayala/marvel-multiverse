/**
 * A type of Roll specific to a damage (or healing) roll in the 5e system.
 * @param {string} formula                       The string formula to parse
 * @param {object} data                          The data object against which to parse attributes within the formula
 * @param {object} [options={}]                  Extra optional arguments which describe or modify the DamageRoll
 * @param {number} [options.fantasticBonusDice=0]      A number of bonus damage dice that are added for fantastic hits
 * @param {number} [options.fantasticMultiplier=2]     A fantastic hit multiplier which is applied to fantastic hits
 * @param {boolean} [options.multiplyNumeric=false]   Multiply numeric terms by the fantastic multiplier
 * @param {boolean} [options.powerfulfantastic=false]  Apply the "powerful fantastics" house rule to fantastic hits
 * @param {string} [options.fantasticBonusDamage]      An extra damage term that is applied only on a fantastic hit
 */
export class DamageRoll extends Roll {
    constructor(formula, data, options) {
      super(formula, data, options);
      if ( !this.options.preprocessed ) this.preprocessFormula();
      // For backwards compatibility, skip rolls which do not have the "fantastic" option defined
      if ( (this.options.fantastic !== undefined) && !this.options.configured ) this.configureDamage();
    }
  
    /* -------------------------------------------- */

    /**
     * Create a DamageRoll from a standard Roll instance.
     * @param {Roll} roll
     * @returns {DamageRoll}
     */
    static fromRoll(roll) {
        const newRoll = new this(roll.formula, roll.data, roll.options);
        Object.assign(newRoll, roll);
        return newRoll;
    }

    /* -------------------------------------------- */

    /**
     * The HTML template path used to configure evaluation of this Roll
     * @type {string}
     */
    static EVALUATION_TEMPLATE = "systems/marvel-multiverse/templates/chat/roll-dialog.hbs";

    /* -------------------------------------------- */
    
    /**
     * A convenience reference for whether this DamageRoll is a fantastic result
     * @type {boolean}
     */
    get isFantastic() {
        return this.options.fantastic;
    }


    /* -------------------------------------------- */
    /*  Damage Roll Methods                         */
    /* -------------------------------------------- */

    /**
     * Perform any term-merging required to ensure that fantastics can be calculated successfully.
     * @protected
     */
    preprocessFormula() {
        for ( let [i, term] of this.terms.entries() ) {
            const nextTerm = this.terms[i + 1];
            const prevTerm = this.terms[i - 1];

            // Convert shorthand dX terms to 1dX preemptively to allow them to be appropriately doubled for fantastic hits
            if ( (term instanceof foundry.dice.terms.StringTerm) && /^d\d+/.test(term.term) && !(prevTerm instanceof foundry.dice.terms.ParentheticalTerm) ) {
              const formula = `1${term.term}`;
              const newTerm = new Roll(formula).terms[0];
              this.terms.splice(i, 1, newTerm);
              term = newTerm;
            }
            
            // Merge parenthetical terms that follow string terms to build a dice term (to allow fantastics)
            else if ( (term instanceof foundry.dice.terms.ParentheticalTerm) && (prevTerm instanceof foundry.dice.terms.StringTerm)
            && prevTerm.term.match(/^[0-9]*d$/)) {
              if ( term.isDeterministic ) {
                  let newFormula = `${prevTerm.term}${term.evaluate().total}`;
                  let deleteCount = 2;

                  // Merge in any roll modifiers
                  if ( nextTerm instanceof foundry.dice.terms.StringTerm ) {
                  newFormula += nextTerm.term;
                  deleteCount += 1;
                  }

                  const newTerm = (new Roll(newFormula)).terms[0];
                  this.terms.splice(i - 1, deleteCount, newTerm);
                  term = newTerm;
              }
            }

            // Merge any parenthetical terms followed by string terms
            else if ( (term instanceof foundry.dice.terms.ParentheticalTerm || term instanceof foundry.dice.terms.FunctionTerm) && (nextTerm instanceof foundry.dice.terms.StringTerm)
            && nextTerm.term.match(/^d[0-9]*$/)) {
                if ( term.isDeterministic ) {
                    const newFormula = `${term.evaluate().total}${nextTerm.term}`;
                    const newTerm = (new Roll(newFormula)).terms[0];
                    this.terms.splice(i, 2, newTerm);
                    term = newTerm;
                }
            }
        }

        // Re-compile the underlying formula
        this._formula = this.constructor.getFormula(this.terms);

        // Mark configuration as complete
        this.options.preprocessed = true;

    }
  /* -------------------------------------------- */

  /**
   * Apply optional modifiers which customize the behavior of the d20term.
   * @protected
   */
  configureDamage() {
    let flatBonus = 0;
    for ( let [i, term] of this.terms.entries() ) {
      // Multiply dice terms
      if ( term instanceof foundry.dice.terms.DiceTerm ) {
        term.options.baseNumber = term.options.baseNumber ?? term.number; // Reset back
        term.number = term.options.baseNumber;
        if ( this.isFantastic ) {
          let cm = this.options.fantasticMultiplier ?? 2;

          // Powerful fantastic - maximize damage and reduce the multiplier by 1
          if ( this.options.powerfulfantastic ) {
            flatBonus += (term.number * term.faces);
            cm = Math.max(1, cm-1);
          }

          // Alter the damage term
          let cb = (this.options.fantasticBonusDice && (i === 0)) ? this.options.fantasticBonusDice : 0;
          term.alter(cm, cb);
          term.options.fantastic = true;
        }
      }

      // Multiply numeric terms
      else if ( this.options.multiplyNumeric && (term instanceof foundry.dice.terms.NumericTerm) ) {
        term.options.baseNumber = term.options.baseNumber ?? term.number; // Reset back
        term.number = term.options.baseNumber;
        if ( this.isFantastic ) {
          term.number *= (this.options.fantasticMultiplier ?? 2);
          term.options.fantastic = true;
        }
      }
    }

    // Add powerful fantastic bonus
    if ( this.options.powerfulfantastic && (flatBonus > 0) ) {
      this.terms.push(new foundry.dice.terms.OperatorTerm({operator: "+"}));
      this.terms.push(new foundry.dice.terms.NumericTerm({number: flatBonus}, {flavor: game.i18n.localize("MARVEL_MULTIVERSE.Powerfulfantastic")}));
    }

    // Add extra fantastic damage term
    if ( this.isFantastic && this.options.fantasticBonusDamage ) {
      const extra = new Roll(this.options.fantasticBonusDamage, this.data);
      if ( !(extra.terms[0] instanceof foundry.dice.terms.OperatorTerm) ) this.terms.push(new foundry.dice.terms.OperatorTerm({operator: "+"}));
      this.terms.push(...extra.terms);
    }

    // Re-compile the underlying formula
    this._formula = this.constructor.getFormula(this.terms);

    // Mark configuration as complete
    this.options.configured = true;
  }

  /* -------------------------------------------- */
  /*  Chat Messages                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  toMessage(messageData={}, options={}) {
    return this.constructor.toMessage([this], messageData, options);
  }

  /* -------------------------------------------- */

  /**
   * Transform a Roll instance into a ChatMessage, displaying the roll result.
   * This function can either create the ChatMessage directly, or return the data object that will be used to create.
   *
   * @param {DamageRoll[]} rolls             Rolls to add to the message.
   * @param {object} messageData             The data object to use when creating the message.
   * @param {options} [options]              Additional options which modify the created message.
   * @param {string} [options.rollMode]      The template roll mode to use for the message from CONFIG.Dice.rollModes.
   * @param {boolean} [options.create=true]  Whether to automatically create the chat message, or only return the
   *                                         prepared chatData object.
   * @returns {Promise<ChatMessage|object>}  A promise which resolves to the created ChatMessage document if create is
   *                                         true, or the Object of prepared chatData otherwise.
   */
  static async toMessage(rolls, messageData={}, {rollMode, create=true}={}) {
    let isFantastic = false;
    for ( const roll of rolls ) {
      if ( !roll._evaluated ) await roll.evaluate({async: true});
      messageData.flavor ??= roll.options.flavor;
      rollMode = roll.options.rollMode;
      isFantastic ||= roll.isFantastic;
    }
    if ( isFantastic ) {
      const label = game.i18n.localize("MARVEL_MULTIVERSE.fantasticRoll");
      messageData.flavor = messageData.flavor ? `${messageData.flavor} (${label})` : label;
    }
    rollMode ??= messageData.rollMode;

    // Prepare chat data
    messageData = foundry.utils.mergeObject({
      user: game.user.id,
      sound: CONFIG.sounds.dice
    }, messageData);
    messageData.rolls = rolls;
    // TODO: Remove when v11 support is dropped.
    if ( game.release.generation < 12 ) messageData.type = CONST.CHAT_MESSAGE_TYPES.ROLL;

    // Either create the message or just return the chat data
    const cls = getDocumentClass("ChatMessage");
    const msg = new cls(messageData);

    // Either create or return the data
    if ( create ) return cls.create(msg.toObject(), { rollMode });
    else {
      if ( rollMode ) msg.applyRollMode(rollMode);
      return msg.toObject();
    }
  }

  /* -------------------------------------------- */
  /*  Configuration Dialog                        */
  /* -------------------------------------------- */

  /**
   * Create a Dialog prompt used to configure evaluation of an existing D20Roll instance.
   * @param {object} data                     Dialog configuration data
   * @param {string} [data.title]               The title of the shown dialog window
   * @param {number} [data.defaultRollMode]     The roll mode that the roll mode select element should default to
   * @param {string} [data.defaultfantastic]     Should fantastic be selected as default
   * @param {string} [data.template]            A custom path to an HTML template to use instead of the default
   * @param {boolean} [data.allowfantastic=true] Allow fantastic hit to be chosen as a possible damage mode
   * @param {object} options                  Additional Dialog customization options
   * @returns {Promise<MarvelMultiverseRoll|null>}         A resulting MarvelMultiverseRoll object constructed with the dialog, or null if the
   *                                          dialog was closed
   */
  async configureDialog(data={}, options={}) {
    const rolls = await this.constructor.configureDialog([this], data, options);
    return rolls[0] ?? null;
  }

  /* -------------------------------------------- */

  /**
   * Create a Dialog prompt used to configure evaluation of one or more daamge rolls.
   * @param {DamageRoll[]} rolls                Damage rolls to configure.
   * @param {object} [data={}]                  Dialog configuration data
   * @param {string} [data.title]               The title of the shown dialog window
   * @param {number} [data.defaultRollMode]     The roll mode that the roll mode select element should default to
   * @param {string} [data.defaultfantastic]     Should fantastic be selected as default
   * @param {string} [data.template]            A custom path to an HTML template to use instead of the default
   * @param {boolean} [data.allowfantastic=true] Allow fantastic hit to be chosen as a possible damage mode
   * @param {object} options                    Additional Dialog customization options
   * @returns {Promise<MarvelMultiverseRoll|null>}           A resulting MarvelMultiverseRoll object constructed with the dialog, or null if the
   *                                            dialog was closed
   */
  static async configureDialog(rolls, {
    title, defaultRollMode, defaultfantastic=false, template, allowfantastic=true}={}, options={}) {

        // Render the Dialog inner HTML
        const content = await renderTemplate(template ?? this.EVALUATION_TEMPLATE, {
        formulas: rolls.map((roll, index) => ({
            formula: `${roll.formula}${index === 0 ? " + @bonus" : ""}`,
            type: CONFIG.MARVEL_MULTIVERSE.damageTypes[roll.options.type]?.label
            ?? CONFIG.MARVEL_MULTIVERSE.healingTypes[roll.options.type]?.label ?? null
        })),
        defaultRollMode,
        rollModes: CONFIG.Dice.rollModes
        });

        // Create the Dialog window and await submission of the form
        return new Promise(resolve => {
        new Dialog({
            title,
            content,
            buttons: {
              fantastic: {
                  condition: allowfantastic,
                  label: game.i18n.localize("MARVEL_MULTIVERSE.fantasticRoll"),
                  callback: html => resolve(rolls.map((r, i) => r._onDialogSubmit(html, true, i === 0)))
              },
              normal: {
                  label: game.i18n.localize(allowfantastic ? "MARVEL_MULTIVERSE.Normal" : "MARVEL_MULTIVERSE.Roll"),
                  callback: html => resolve(rolls.map((r, i) => r._onDialogSubmit(html, false, i === 0)))
              }
            },
            default: defaultfantastic ? "fantastic" : "normal",
            close: () => resolve(null)
        }, options).render(true);
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle submission of the Roll evaluation configuration Dialog
     * @param {jQuery} html         The submitted dialog content
     * @param {boolean} isFantastic  Is the damage a fantastic hit?
     * @param {boolean} isFirst     Is this the first roll being prepared?
     * @returns {DamageRoll}        This damage roll.
     * @private
     */
    _onDialogSubmit(html, isFantastic, isFirst) {
        const form = html[0].querySelector("form");

        // Append a situational bonus term
        if ( form.bonus.value && isFirst ) {
        const bonus = new DamageRoll(form.bonus.value, this.data);
        if ( !(bonus.terms[0] instanceof foundry.dice.terms.OperatorTerm) ) this.terms.push(new foundry.dice.terms.OperatorTerm({operator: "+"}));
        this.terms = this.terms.concat(bonus.terms);
        }

        // Apply advantage or disadvantage
        this.options.fantastic = isFantastic;
        this.options.rollMode = form.rollMode.value;
        this.configureDamage();
        return this;
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    static fromData(data) {
        const roll = super.fromData(data);
        roll._formula = this.getFormula(roll.terms);
        return roll;
    }
  }
