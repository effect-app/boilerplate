import type { InvalidStateError, OptimisticConcurrencyException } from "@/errors.js"
import { makeFilters } from "@effect-ts-app/boilerplate-infra/lib/filter"
import type { RequestContext } from "@effect-ts-app/boilerplate-infra/lib/RequestContext"
import type { Repository } from "@effect-ts-app/boilerplate-infra/services/Repository"
import type { Filter, Where } from "@effect-ts-app/boilerplate-infra/services/Store"
import { ContextMap, StoreMaker } from "@effect-ts-app/boilerplate-infra/services/Store"
import type { UserId } from "@effect-ts-app/boilerplate-types/User"
import { User } from "@effect-ts-app/boilerplate-types/User"
import { makeCodec } from "@effect-ts-app/infra/context/schema"
import { UserProfile } from "../UserProfile.js"

export interface UserPersistenceModel extends User.Encoded {
  _etag: string | undefined
}

const f_ = makeFilters<UserPersistenceModel>()
export type UserWhereFilter = typeof f_

export function makeUserFilter_(filter: (f: UserWhereFilter) => Filter<UserPersistenceModel>) {
  return filter(f_)
}

export function usersWhere(
  makeWhere: (
    f: UserWhereFilter
  ) => Where | readonly [Where, ...Where[]],
  mode?: "or" | "and"
) {
  return makeUserFilter_(f => {
    const m = makeWhere ? makeWhere(f) : []
    return ({
      mode,
      where: (Array.isArray(m) ? m as unknown as [Where, ...Where[]] : [m]) as readonly [Where, ...Where[]]
    })
  })
}

const [_dec, _encode, encodeToMap] = makeCodec(User)
const encodeToMapPM = flow(
  encodeToMap,
  _ =>
    _.flatMap(map =>
      Effect.gen(function*($) {
        const { get } = yield* $(ContextMap.get)
        return new Map(
          [...map.entries()].map(([k, v]) => [k, mapToPersistenceModel(v, get)])
        )
      })
    )
)

function mapToPersistenceModel(
  e: User.Encoded,
  getEtag: (id: string) => string | undefined
): UserPersistenceModel {
  return {
    ...e,
    _etag: getEtag(e.id)
  }
}

function mapReverse(
  { _etag, ...e }: UserPersistenceModel,
  setEtag: (id: string, eTag: string | undefined) => void
): User.Encoded {
  setEtag(e.id, _etag)
  return e
}

const fakeUsers = ReadonlyArray.range(1, 8)
  .map((_, i): User => ({
    ...User.Arbitrary.generate.value,
    role: i === 0 || i === 1 ? "manager" : "user"
  })).toNonEmpty
  .match(() => {
    throw new Error("must have fake users")
  }, _ => _)

export type UserSeed = "sample" | ""

/**
 * NOTE: Printer uniqueness handling is currently not optimal, and only uses a local lock,
 * so when running multiple instances, uniqueness is currently not guaranteed.
 */
function makeUserRepository(seed: UserSeed) {
  return Do($ => {
    const { make } = $(Effect.service(StoreMaker))

    const makeItems = Effect.sync(() => {
      const items = seed === "sample" ? fakeUsers : []
      return items
    })

    const store = $(
      make<UserPersistenceModel, string, UserId>(
        "Users",
        makeItems.flatMap(encodeToMapPM).setupNamedRequest("initial"),
        {
          partitionValue: _ => "primary" /*(isIntegrationEvent(r) ? r.companyId : r.id*/
        }
      )
    )

    const allE = store.all.flatMap(items =>
      Do($ => {
        const { set } = $(Effect.service(ContextMap))
        return items.map(_ => mapReverse(_, set))
      })
    )

    const all = allE.flatMap(_ => _.forEachEffect(User.EParser.condemnDie))

    function findE(id: UserId) {
      return store.find(id)
        .flatMap(items =>
          Do($ => {
            const { set } = $(Effect.service(ContextMap))
            return items.map(_ => mapReverse(_, set))
          })
        )
    }

    function find(id: UserId) {
      return findE(id).flatMapOpt(User.EParser.condemnDie)
    }

    // const saveE = (a: User.Encoded) =>
    //   Do($ => {
    //     const { get, set } = $(Effect.service(ContextMap))
    //     const e = mapToPersistenceModel(a, get)

    //     $(
    //       permit.withPermit(
    //         allE.flatMap(u =>
    //           e.printer?.printerId &&
    //             u.filter(_ => _.id !== e.id).some(v => v.printer?.printerId === e.printer!.printerId)
    //             ? Effect.fail({
    //               _tag: "IndexError" as const,
    //               message: "Found duplicate printerId: " + e.printer.printerId
    //             })
    //             : store.set(e)
    //         )
    //           .flatMap(ret => Effect.sync(set(ret.id, ret._etag)))
    //       )
    //     )
    //   })

    // const save = (a: User) => saveE(User.Encoder(a))

    const saveAllE = (a: Iterable<User.Encoded>) =>
      Effect.succeed(a.toNonEmptyArray)
        .flatMapOpt(a =>
          Do($ => {
            const { get, set } = $(Effect.service(ContextMap))
            const items = a.mapNonEmpty(_ => mapToPersistenceModel(_, get))
            // TODO: Check duplicate printer
            const ret = $(store.batchSet(items))
            ret.forEach(_ => set(_.id, _._etag))
          })
        )

    const saveAll = (a: Iterable<User>) => saveAllE(a.toChunk.map(User.Encoder))

    const save = (items: Iterable<User>, _: Iterable<never> = []) => saveAll(items)
    // .tap(() =>
    //   Effect.succeed(items.toNonEmptyArray).tapOpt(items =>
    //     // TODO: Poor Man's state change report; should perhaps auto track and filter for: ItemChanged, ItemStateChanged, or not changed.
    //     publishClientEvent(ClientEvents.of.UserStatesUpdated({ items }))
    //   )
    // )
    // .zipRight(
    //   Effect.succeed(events.toNonEmptyArray)
    //     // TODO: for full consistency the events should be stored within the same database transaction, and then picked up.
    //     .flatMapOpt(publish)
    // )

    const r: UserRepository = {
      /**
       * @internal
       */
      utils: { mapReverse, parse: User.Parser.unsafe, filter: store.filter, all: store.all },
      itemType: "User",
      find,
      all,
      save: u => save(u) // TODO
      /*
.catchTag(
          "IndexError",
          () => Effect.fail(new InvalidStateError(`Duplicate printer id ${u.printer?.printerId}`))
        )
      */
    }
    return r
  })
}

/**
 * @tsplus type UserRepository
 */
export interface UserRepository extends Repository<User, UserPersistenceModel, never, UserId, "User"> {
  all: Effect<ContextMap, never, Chunk<User>>
  save: (
    items: Iterable<User>,
    events?: Iterable<never> | undefined
  ) => Effect<ContextMap | RequestContext, OptimisticConcurrencyException | InvalidStateError, void>
}

/**
 * @tsplus type UserRepository.Ops
 */
export interface UserRepositoryOps extends Tag<UserRepository> {}

export const UserRepository: UserRepositoryOps = Tag<UserRepository>()

/**
 * @tsplus static UserRepository.Ops Live
 */
export function LiveUserRepository(seed: UserSeed) {
  return makeUserRepository(seed).toLayer(UserRepository)
}

/**
 * @tsplus getter UserRepository getCurrentUser
 */
export function getCurrentUser(repo: UserRepository) {
  return UserProfile.withEffect(_ => _.get.flatMap(_ => repo.get(_.id)))
}

/**
 * @tsplus fluent UserRepository update
 */
export function update(repo: UserRepository, mod: (user: User) => User) {
  return UserProfile.withEffect(_ => _.get.flatMap(_ => repo.get(_.id)).map(mod).flatMap(_ => repo.save([_])))
}

/**
 * @tsplus fluent UserRepository updateWithEffect
 */
export function userUpdateWithEffect<R, E>(repo: UserRepository, mod: (user: User) => Effect<R, E, User>) {
  return UserProfile.withEffect(_ => _.get.flatMap(_ => repo.get(_.id)).flatMap(mod).flatMap(_ => repo.save([_])))
}
