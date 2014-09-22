<?php
global $xt_error_logs, $xt_error_log_dir;

$xt_error_log_dir = 'TEMP_DIR_PLACEHOLDER';

function xt_error_log_handle( $errno, $errstr = '', $errfile = '', $errline = null, $errcontext = array() ) {
	global $xt_error_logs;
	$xt_error_logs[] = func_get_args();
	return false; // So the php error handler is not bypassed, affecting how the page would behave
}

function xt_error_log_output() {
	global $xt_error_logs, $xt_error_log_dir;
	$url = str_replace( '/', '_', $_SERVER['REQUEST_URI'] );
	file_put_contents( $xt_error_log_dir . '/' . $url, var_export( $xt_error_logs, true ) );
}

set_error_handler( 'xt_error_log_handle', E_ALL );
register_shutdown_function( 'xt_error_log_output' );
