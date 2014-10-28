#!/bin/bash
# This is meant to be run inside project webroot folder

# require PhantomJS, installable via:
# sudo apt-get install phantomjs
command -v phantomjs >/dev/null 2>&1 || { echo >&2 "This script requirs PhantomJS but it's not installed. Aborting."; exit 1; }

DIR=`dirname $0`
PROJECT_ROOT=`pwd`
HASH=`md5sum <<< "$PROJECT_ROOT" | awk '{ print $1 }'`
TMP="/tmp/wp-upgrader/$HASH"

shopt -s expand_aliases

SITEURL=`wp option get siteurl --url="/" 2> /dev/null`
alias wp="wp --url=\"$SITEURL\""

SITEROOT=`wp eval 'echo realpath(ABSPATH);' 2> /dev/null`
WP_CONTENT_DIR=`wp eval 'echo WP_CONTENT_DIR;' 2> /dev/null`

echo "* Site URL detected as $SITEURL"
echo "* Site Root detected as $SITEROOT"
echo "* WP_CONTENT detected as $WP_CONTENT_DIR"

# Create our tmp directory
echo "* Creating temporary directory $TMP"
rm -fr $TMP
mkdir -p $TMP/{before,after}/shots
chmod -R 777 $TMP/{before,after}

# Backup DB
#echo "* Exporting DB"
#wp db export $TMP/before.sql

cd $SITEROOT


## Switching to a new branch
#echo "* Switching to 'upgrade' branch"
#if [ -d "$SITEROOT" ]; then
## Clean any git submodule references, so we can create the new repo
#for GITREF in $(find `pwd`/wp-content/plugins/ -maxdepth 5 -name '.git'); do
#        rm $GITREF;
#done
#	git init
#	git add .
#	git commit -q -m 'First commit'
#else
#	git checkout -f # clean any unsaved changes
#	git checkout master # checkout the master branch
#fi
#git checkout -b upgrade || ( echo 'Could not create upgrade branch'; exit 1; ) # create a new upgrade branch, and exit if failed

# Add our mu-plugin to collect 'error_log's
sed "s|TEMP_DIR_PLACEHOLDER|$TMP/before/php.log|" $DIR/mu-plugins/php_error_log_handle.php > $WP_CONTENT_DIR/mu-plugins/xt_php_error_log_handle.php

# Secure a new admin user so we can
wp user create wpupgrade wpugrade@test.test --role=administrator --user_pass=wpupgrade

# Traverse the site homepage, and all links within
echo "* Collecting PHP/JS errors from site/backend pages"
phantomjs $DIR/request.js "$SITEURL" "$TMP/before/shots/" | tee $TMP/before/phantom-site.log
phantomjs $DIR/request.js "$SITEURL/wp-admin/" "$TMP/before/shots/" wpupgrade wpupgrade | tee $TMP/before/phantom-admin.log

# UPGRADE ROUTING
# ---------------

echo "* Updating WordPress"
wp core update --version=3.9.2
echo "* Getting list of plugins with available updates"
wp plugin update --all --dry-run >/dev/null 2>&1 # so we have update availability information
PLUGINS=$( wp plugin list --fields=name --format=csv --status=active --update=available | sed 1d )
printf "*- %s\n" ${PLUGINS[@]}

echo "* Updating plugins"
for plugin in $PLUGINS; do
	if [ -a "$WP_CONTENT_DIR/plugins/$plugin/.git" ]; then
		echo "** Ignoring $plugin since it is a submodule"
	else
		echo "** Updating $plugin"
		wp plugin update $plugin
	fi
done

# Add our mu-plugin to collect 'error_log's
sed "s|TEMP_DIR_PLACEHOLDER|$TMP/after/php.log|" $DIR/mu-plugins/php_error_log_handle.php > $WP_CONTENT_DIR/mu-plugins/xt_php_error_log_handle.php

# Traverse the site homepage, and all links within, then wp-admin
phantomjs $DIR/request.js "$SITEURL" "$TMP/after/shots/" | tee $TMP/after/phantom-site.log
phantomjs $DIR/request.js "$SITEURL/wp-admin/" "$TMP/after/shots/" wpupgrade wpupgrade | tee $TMP/after/phantom-admin.log

echo "* Removing the mu-plugin"
rm -f $WP_CONTENT_DIR/mu-plugins/xt_php_error_log_handle.php
wp user delete wpupgrade --yes --reassign=1

# Comparing logs folders
LOG_DIFF="$( diff -rq $TMP/before $TMP/after )"

if [ -z "$LOG_DIFF" ]; then
	echo 'Identical log entries found, upgrade was successful.'
	exit 0
else
#	# Restore DB snapshot
#	git checkout -f
#	git checkout master
#	wp db reset --yes
#	wp db import $TMP/before.sql
	echo 'Different log entries detected, upgrade needs manual handling.'
	echo $LOG_DIFF
	exit 1
fi
