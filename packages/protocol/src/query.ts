// Type-safe helpers for reading parsed IPP messages

import type { IppAttribute, IppAttributeGroup, IppMessage } from './message.js';
import type { GroupTagName } from './message.js';
import type { IppValue, IppValueTag, IppValueOfTag } from './values.js';

/** Find the first group with the given tag in a message */
export function getGroup(msg: IppMessage, tag: GroupTagName): IppAttributeGroup | undefined {
  return msg.groups.find((g) => g.tag === tag);
}

/** Find a named attribute within an attribute group */
export function getAttr(group: IppAttributeGroup, name: string): IppAttribute | undefined {
  return group.attributes.find((a) => a.name === name);
}

/**
 * Read the first value of a named attribute, narrowed to the given tag type.
 * Returns undefined if the attribute is absent, has no values, or the first value's tag differs.
 *
 * @example
 * const state = getAttrValue(printerGroup, 'printer-state', 'enum');
 * // state: EnumValue | undefined
 * state?.value  // 'idle' | 'processing' | 'stopped' | undefined
 */
export function getAttrValue<T extends IppValueTag>(
  group: IppAttributeGroup,
  name: string,
  tag: T,
): IppValueOfTag<T> | undefined {
  const attr = getAttr(group, name);
  if (!attr || attr.values.length === 0) return undefined;
  const val = attr.values[0] as IppValue;
  return val.tag === tag ? (val as IppValueOfTag<T>) : undefined;
}

/**
 * Read all values of a named attribute, filtered to the given tag type.
 * Returns an empty array if the attribute is absent.
 */
export function getAttrValues<T extends IppValueTag>(
  group: IppAttributeGroup,
  name: string,
  tag: T,
): IppValueOfTag<T>[] {
  const attr = getAttr(group, name);
  if (!attr) return [];
  return attr.values.filter((v): v is IppValueOfTag<T> => v.tag === tag);
}

/**
 * Read all values of a named attribute regardless of tag.
 */
export function getAttrAllValues(
  group: IppAttributeGroup,
  name: string,
): readonly IppValue[] {
  return getAttr(group, name)?.values ?? [];
}
