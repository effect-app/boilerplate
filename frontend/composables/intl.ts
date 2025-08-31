import { makeIntl } from "@effect-app/vue"

const messages = {
  de: {
    "handle.waiting": "{action} wird ausgeführt...",
    "handle.success": "{action} erfolgreich",
    "handle.with_errors": "{action} fehlgeschlagen",
    "handle.with_warnings": "{action} erfolgreich, mit Warnungen",
    "handle.error_response":
      "Die Anfrage war nicht erfolgreich:\n{error}\nWir wurden benachrichtigt und werden das Problem in Kürze beheben.",
    "handle.response_error":
      "Die Antwort konnte nicht verarbeitet werden:\n{error}",
    "handle.request_error":
      "Die Anfrage konnte nicht gesendet werden:\n{error}",
    "handle.unexpected_error": "Unerwarteter Fehler:\n{error}",

    "validation.empty": `Das Feld darf nicht leer sein`,
    "validation.number.max":
      "Der Wert sollte {isExclusive, select, true {kleiner als} other {höchstens}} {maximum} sein",
    "validation.number.min": `Der Wert sollte {isExclusive, select, true {größer als} other {mindestens}} {minimum} sein`,
    "validation.string.maxLength": `Das Feld darf nicht mehr als {maxLength} Zeichen haben`,
    "validation.string.minLength": `Das Feld muss mindestens {minLength} Zeichen enthalten`,
    "validation.not_a_valid": `Der eingegebene Wert ist kein gültiger {type}: {message}`,
    "validation.failed": "Ungültige Eingabe",
  },
  en: {
    "handle.waiting": "{action} executing...",
    "handle.success": "{action} Success",
    "handle.with_errors": "{action} Failed",
    "handle.with_warnings": "{action}, with warnings",
    "handle.error_response":
      "There was an error in processing the response:\n{error}\nWe have been notified and will fix the problem shortly.",
    "handle.request_error": "There was an error in the request:\n{error}",
    "handle.response_error": "The request was not successful:\n{error}",
    "handle.unexpected_error": "Unexpected Error:\n{error}",

    "validation.empty": "The field cannot be empty",
    "validation.number.max":
      "The value should be {isExclusive, select, true {smaller than} other {at most}} {maximum}",
    "validation.number.min":
      "The value should be {isExclusive, select, true {larger than} other {at least}} {minimum}",
    "validation.string.maxLength":
      "The field cannot have more than {maxLength} characters",
    "validation.string.minLength":
      "The field requires at least {minLength} characters",
    "validation.not_a_valid":
      "The entered value is not a valid {type}: {message}",
    "validation.failed": "Invalid input",
  },
} as const

export const { LocaleContext, useIntl } = makeIntl(messages, "de")
