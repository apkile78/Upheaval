/**
 * Web Mercator slippy-map projection helpers for the 90 m fine-detail layer.
 *
 * The fine layer is backed by Terrarium-encoded Mapzen Joerd elevation PNGs
 * (public domain, z14 tiles, 256x256 pixels). Unlike the equirectangular base
 * grid, these tiles are projection-native: each zoom-14 tile covers a fixed
 * longitude/latitude rectangle, and meters are decoded deterministically as
 * R*256 + G + B/256 - 32768.
 */