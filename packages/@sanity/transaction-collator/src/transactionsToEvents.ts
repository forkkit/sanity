import {isEqual, uniq} from 'lodash'
import {EventType, HistoryEvent, Transaction, Mutation} from './types'
import {ndjsonToArray} from './utils/ndjsonToArray'

const EDIT_EVENT_TIME_TRESHHOLD_MS = 5 * 1000 * 60 * 5 // 5 minutes

export function transactionsToEvents(
  documentIds: string[],
  transactions: string | Buffer | Transaction[]
): HistoryEvent[] {
  const rawItems = Array.isArray(transactions) ? transactions : ndjsonToArray(transactions)
  return (
    rawItems
      // Make sure we only deal with transactions that are relevant for our documents
      .filter(
        (transaction: Transaction) =>
          transaction.documentIDs && transaction.documentIDs.some(id => documentIds.includes(id))
      )
      // ensure transactions are sorted by time
      .sort(compareTimestamp)
      // Turn a transaction into a classified HistoryEvent
      .map((transaction, index) => {
        return mapToEvents(transaction, documentIds, index)
      })
      // Filter out discardDraft (no longer possible in the history studio release)
      .filter(event => event.type !== 'discardDraft')
      // Chunk and group edit events
      .reduce(reduceEdits, [])
  )
}

function mapToEvents(
  transaction: Transaction,
  documentIds: string[],
  index: number = 0
): HistoryEvent {
  const {type, documentId} = mutationsToEventTypeAndDocumentId(transaction.mutations, index)
  const timestamp = new Date(transaction.timestamp)
  const userIds = findUserIds(transaction, type)
  return {
    type,
    documentIDs: transaction.documentIDs,
    displayDocumentId: documentId,
    rev: transaction.id,
    userIds,
    startTime: timestamp,
    endTime: timestamp
  }
}

function reduceEdits(
  acc: HistoryEvent[],
  current: HistoryEvent,
  index: number,
  arr: HistoryEvent[]
) {
  const nextEvent = arr[index + 1]
  const skipEvent =
    current.type === 'edited' &&
    nextEvent &&
    nextEvent.type === 'edited' &&
    nextEvent.endTime.getTime() - current.endTime.getTime() < EDIT_EVENT_TIME_TRESHHOLD_MS &&
    isEqual(current.documentIDs, nextEvent.documentIDs)
  if (skipEvent) {
    // Lift authors over to next event
    nextEvent.userIds = uniq(nextEvent.userIds.concat(current.userIds))
    // Set startTime on next event to be this one if not done already
    // (then startTime and endTime would be different)
    if (current.startTime.getTime() === current.endTime.getTime()) {
      nextEvent.startTime = current.startTime
    }
  } else {
    acc.push(current)
  }
  return acc
}

export function mutationsToEventTypeAndDocumentId(mutations: Mutation[], transactionIndex: number): {type: EventType, documentId?: string} {
  const withoutPatches = mutations.filter(mut => mut.patch === undefined)
  const createOrReplaceMutation = withoutPatches.find(mut => mut.createOrReplace !== undefined)
  const createOrReplacePatch = createOrReplaceMutation && createOrReplaceMutation.createOrReplace

  const createMutation = withoutPatches.find(mut => mut.create !== undefined)
  const createPatch = createMutation && createMutation.create

  const createIfNotExistsMutation = withoutPatches.find(mut => mut.createIfNotExists !== undefined)
  const createIfNotExistsPatch =
    createIfNotExistsMutation && createIfNotExistsMutation.createIfNotExists

  const deleteMutation = withoutPatches.find(mut => mut.delete !== undefined)
  const deletePatch = deleteMutation && deleteMutation.delete

  const squashedMutation = withoutPatches.find(mut => mut.createSquashed !== undefined)
  const squashedPatch = squashedMutation && squashedMutation.createSquashed

  const createValue = createOrReplacePatch || createPatch || createIfNotExistsPatch

  // Created
  if (transactionIndex === 0) {
    const type = 'created'
    if (createOrReplacePatch) {
      return {type, documentId: createOrReplacePatch._id}
    }
    if (createIfNotExistsPatch) {
      return {type, documentId: createIfNotExistsPatch._id}
    }
    if (createPatch) {
      return {type, documentId: createPatch._id}
    }
  }

  // (re) created
  if (transactionIndex > 0 && mutations.length === 1 && createIfNotExistsPatch) {
    const type = createIfNotExistsPatch._id.startsWith('.draft') ? 'edited' : 'published'
    return {type, documentId: createIfNotExistsPatch._id}
  }

  // Published
  if ((createOrReplacePatch || createPatch || createIfNotExistsPatch) && deletePatch && deletePatch.id.startsWith('drafts.')) {
    return {
      type: 'published',
      documentId: createValue && createValue._id
    }
  }

  // Unpublished
  if (
    withoutPatches.length === 2 &&
    (createIfNotExistsPatch || createPatch) &&
    deletePatch &&
    !deletePatch.id.startsWith('drafts.')
  ) {
    return {
      type: 'unpublished',
      documentId: createValue && createValue._id
    }
  }

  // Restored to previous version
  if (
    ((createOrReplacePatch && createOrReplacePatch._id.startsWith('drafts.')) ||
      (createPatch && createPatch._id.startsWith('drafts.')) ||
      (createIfNotExistsPatch && createIfNotExistsPatch._id.startsWith('drafts.')))
  ) {
    return {
      type: 'edited', // (return 'edited' for now, should be 'restored' in the future when we can tag transactions)
      documentId: createValue && createValue._id
    }
  }

  // Discard drafted changes
  if (mutations.length === 1 && deletePatch && deletePatch.id.startsWith('drafts.')) {
    return {type: 'discardDraft', documentId: undefined}
  }

  // Truncated history
  if (mutations.length === 1 && squashedPatch) {
    return {type: 'truncated', documentId: squashedPatch._id}
  }

  // Deleted
  if (mutations.every(mut => mut.delete !== undefined)) {
    return {type: 'deleted', documentId: undefined}
  }

  // Edited
  const patchedMutation = mutations.find(mut => mut.patch !== undefined)
  if (patchedMutation && patchedMutation.patch) {
    return {type: 'edited', documentId: patchedMutation.patch.id}
  }

  // Unknown!
  return {type: 'unknown', documentId: undefined}
}

function findUserIds(transaction: Transaction, type: EventType): string[] {
  // The truncated event is kind of special
  if (type === 'truncated') {
    const createSquasedMut = transaction.mutations.find(mut => mut.createSquashed !== undefined)
    const createSquasedPatch = createSquasedMut && createSquasedMut.createSquashed
    if (createSquasedPatch) {
      return createSquasedPatch.authors
    }
  }
  // Default is to return the transaction author
  return [transaction.author]
}

function compareTimestamp(a: Transaction, b: Transaction) {
  return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
}