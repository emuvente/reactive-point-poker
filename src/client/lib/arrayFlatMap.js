import Kefir from 'kefir';

// turn array of values into a merged stream of streams returned from fn called with a value from array
export default (array, fn) => Kefir.constant(array).flatten().flatMap(fn);
