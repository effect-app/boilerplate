import { makeIntl } from "@effect-app/vue"
import { DefaultIntl } from "@effect-app/vue/experimental/commander"

const messages = {
  de: {
    "action.HelloWorld.SetState": "Hallo Welt Zustand setzen",

    ...DefaultIntl.de,

    "handle.unexpected_error": "Unerwarteter Fehler:\n{error}",

    "validation.empty": `Das Feld darf nicht leer sein`,
    "validation.number.max":
      "Der Wert sollte {isExclusive, select, true {kleiner als} other {höchstens}} {maximum} sein",
    "validation.number.min":
      `Der Wert sollte {isExclusive, select, true {größer als} other {mindestens}} {minimum} sein`,
    "validation.string.maxLength": `Das Feld darf nicht mehr als {maxLength} Zeichen haben`,
    "validation.string.minLength": `Das Feld muss mindestens {minLength} Zeichen enthalten`,
    "validation.not_a_valid": `Der eingegebene Wert ist kein gültiger {type}: {message}`,
    "validation.failed": "Ungültige Eingabe"
  },
  en: {
    "action.HelloWorld.SetState": "Set Hello World State",

    ...DefaultIntl.en,

    "handle.unexpected_error": "Unexpected Error:\n{error}",

    "validation.empty": "The field cannot be empty",
    "validation.number.max": "The value should be {isExclusive, select, true {smaller than} other {at most}} {maximum}",
    "validation.number.min": "The value should be {isExclusive, select, true {larger than} other {at least}} {minimum}",
    "validation.string.maxLength": "The field cannot have more than {maxLength} characters",
    "validation.string.minLength": "The field requires at least {minLength} characters",
    "validation.not_a_valid": "The entered value is not a valid {type}: {message}",
    "validation.failed": "Invalid input"
  }
} as const

export const { LocaleContext, useIntl } = makeIntl(messages, "de")
