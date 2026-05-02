/**
 * Vue *templates* have issues with collissions of built in types like Array, Object, Date etc.
 * So we use the `$$` namespace to avoid that.
 * $ would've been preferred but is already reserved within Vue templates :/
 */
export * as $$ from "effect-app"
