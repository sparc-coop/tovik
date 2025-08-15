<?php
/*
 * Plugin Name: Tovik
 * Description: Your site, multilingual in minutes.
 * Version: 1.0
 * Author: Sparc Cooperative
 * Author URI: https://sparc.coop/
 * License: GPL v2 or later
 * Text Domain: Tovik
 */


function tovik_scripts() {
    wp_enqueue_script_module('tovik', 'https://tovik.app/tovik.js');
}

add_action( 'wp_enqueue_scripts', 'tovik_scripts' );

?>