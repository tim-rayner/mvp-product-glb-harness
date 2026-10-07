/** Name of the wrapper node that carries the correction transform. */
export const NORMALISATION_NODE_NAME = "dimensional-normalisation";

export const INSTANCING_EXTENSION = "EXT_mesh_gpu_instancing";

/** "glTF" as a little-endian uint32. */
export const GLB_MAGIC = 0x46546c67;
export const GLB_VERSION = 2;
/** Magic, version and total length: three uint32s. */
export const GLB_HEADER_BYTES = 12;
/** "JSON" as a little-endian uint32. */
export const GLB_CHUNK_TYPE_JSON = 0x4e4f534a;
/** The JSON chunk's data follows the file header and its own 8-byte chunk header. */
export const GLB_JSON_CHUNK_OFFSET = GLB_HEADER_BYTES + 8;
