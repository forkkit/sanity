import array from 'role:@sanity/form-builder/input/array?'
import boolean from 'role:@sanity/form-builder/input/boolean?'
import email from 'role:@sanity/form-builder/input/email?'
import geopoint from 'role:@sanity/form-builder/input/geopoint?'
import number from 'role:@sanity/form-builder/input/number?'
import object from 'role:@sanity/form-builder/input/object?'
import reference from 'role:@sanity/form-builder/input/reference?'
import string from 'role:@sanity/form-builder/input/string?'
import text from 'role:@sanity/form-builder/input/text?'
import url from 'role:@sanity/form-builder/input/url?'

const coreTypes = {
  array,
  boolean,
  email,
  geopoint,
  number,
  object,
  reference,
  string,
  text,
  url
}

const inputResolver = (field, fieldType) => {
  const inputRole = coreTypes[field.type] || coreTypes[fieldType.name]
  return field.input || inputRole
}

export default inputResolver
