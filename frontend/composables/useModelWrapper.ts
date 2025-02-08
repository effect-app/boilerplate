import { type WritableComputedRef, computed } from "vue"

export const useModelWrapper = useValueWrapper("modelValue")

export function useValueWrapper<Name extends string>(name: Name) {
  function use<T>(
    props: { [P in Name]: T },
    emit: { (event: `update:${Name}`, value: T): void },
  ): WritableComputedRef<T>
  function use<T>(
    props: { [P in Name]?: T },
    emit: { (event: `update:${Name}`, value: T | undefined): void },
  ): WritableComputedRef<T | undefined>
  function use<T>(
    props: { [P in Name]?: T },
    emit: { (event: `update:${Name}`, value: T | undefined): void },
  ) {
    return useValueWrapper_<T, Name>(props, emit, name)
  }

  return use
}

export function useValueWrapper_<T, Name extends string>(
  props: { [P in Name]: T },
  emit: { (event: `update:${Name}`, value: T): void },
  name: Name,
): WritableComputedRef<T>
export function useValueWrapper_<T, Name extends string>(
  props: { [P in Name]?: T },
  emit: { (event: `update:${Name}`, value: T | undefined): void },
  name: Name,
): WritableComputedRef<T | undefined>
export function useValueWrapper_<T, Name extends string>(
  props: { [P in Name]?: T },
  emit: { (event: `update:${Name}`, value: T | undefined): void },
  name: Name,
) {
  return computed({
    get: () => props[name],
    set: value => emit(`update:${name}`, value),
  })
}
