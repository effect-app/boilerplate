"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var lib_1 = require("#resources/lib");
var effect_app_1 = require("effect-app");
var userProfileFromJson = effect_app_1.S.fromJsonString(lib_1.UserProfile.fromEncoded);
// Force errors to see what the types resolve to
var _checkDS = ds;
var _checkFEDS = feds;
var _checkUPDS = upds;
