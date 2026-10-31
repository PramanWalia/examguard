/**
 * Fisher-Yates shuffle. Pure with respect to its input and injectable RNG so the
 * ordering can be tested deterministically.
 *
 * @template T
 * @param {T[]} items
 * @param {() => number} [random]
 * @returns {T[]}
 */
export const shuffle = (items, random = Math.random) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
};
