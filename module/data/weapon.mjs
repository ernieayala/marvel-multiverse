import MarvelMultiverseItemBase from "./item-base.mjs";

export default class MarvelMultiverseWeapon extends MarvelMultiverseItemBase {
    static defineSchema() {
        const fields = foundry.data.fields;
        const requiredInteger = { required: true, nullable: false, integer: true };
        const schema = super.defineSchema();
    
        schema.melee = new fields.BooleanField({ required: true, initial: true });
        schema.range = new fields.NumberField({ ...requiredInteger, initial: 0 });
        schema.damageMultiplier = new fields.StringField({ blank: true });
        schema.rule = new fields.StringField({ blank: true });
        schema.recommenedRank = new fields.StringField({ blank: true });
        schema.category = new fields.StringField({ blank: true });
        schema.size = new fields.StringField({ blank: true });
        schema.reach = new fields.StringField({ blank: true });
        schema.description = new fields.StringField({ blank: true });
        schema.history = new fields.StringField({ blank: true });
        schema.commentary = new fields.StringField({ blank: true });

        schema.equipped = new fields.BooleanField({ required: true, initial: false });
        
        return schema;
    }

}
