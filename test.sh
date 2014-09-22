#!/bin/bash
# This is meant to be run inside project folder

DIR=`dirname $0`
PROJECT_ROOT=`pwd`
HASH=`md5sum <<< "$PROJECT_ROOT" | awk '{ print $1 }'`
TMP="/tmp/wp-upgrader/$HASH"
USERAGENT="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_0) AppleWebKit/537.1 (KHTML, like Gecko, L_y_n_x) Chrome/21.0.1180.79 Safari/537.1"
SITEROOT=`wp eval 'echo realpath(ABSPATH);'`
SITEURL=`wp option get siteurl`
WP_CONTENT_DIR=`wp eval 'echo WP_CONTENT_DIR;'`

echo "* Site URL detected as $SITEURL"
echo "* Site Root detected as $SITEROOT"
echo "* WP_CONTENT detected as $WP_CONTENT_DIR"

# Create our tmp directory
echo "* Creating temporary directory $TMP"
rm -fr $TMP
mkdir -p $TMP/{before,after}

# Backup DB
echo "* Exporting DB"
wp db export $TMP/before.sql

# Switching to a new branch
echo "* Switching to 'upgrade' branch"
cd $SITEROOT
git checkout -f # clean any unsaved changes
git checkout master # checkout the master branch
git checkout -b upgrade || echo 'Could not create upgrade branch'; exit 1; # create a new upgrade branch, and exit if failed

# Add our mu-plugin to collect 'error_log's
sed "s|TEMP_DIR_PLACEHOLDER|$TMP/before|" $DIR/mu-plugins/php_error_log_handle.php > $WP_CONTENT_DIR/mu-plugins/xt_php_error_log_handle.php

# Get homepage links
echo "* Extracting link list from $SITEURL"
LINKS=$( lynx -dump -useragent="$USERAGENT" -hiddenlinks=merge $SITEURL | sed -n '/^References$/,/References/p' | awk 'NR > 2' | sed 's/[0-9]*\.//'  )

echo "* Traversing links, extracting unique site-based"
declare -a URLS=()
for link in $LINKS
do
	link=$( sed s/#.*// <<< $link )
	[[ $link != *$SITEURL* ]] && continue; # ignore if does not have our SITEURL
	URLS+="$link "
done

echo "* All URLS:"
URLS=$( echo $URLS | tr ' ' '\n' | sort -u )

echo "* Final URL list:"
echo ${URLS[*]} | tr ' ' '\n' | sed -e 's/^/>> /'

# cURL URLS!
for url in $URLS; do
	echo "* -- Hitting $url"
	curl -L -A "$USERAGENT" `awk '{ print $1 }' <<< $url` >/dev/null 2>&1
done

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
sed "s|TEMP_DIR_PLACEHOLDER|$TMP/after|" $DIR/mu-plugins/php_error_log_handle.php > $WP_CONTENT_DIR/mu-plugins/xt_php_error_log_handle.php

# cURL URLS!
for url in $URLS; do
	echo "* -- Hitting $url"
	curl -L -A "$USERAGENT" `awk '{ print $1 }' <<< $url` >/dev/null 2>&1
done

echo "* Removing the mu-plugin"
rm -f $WP_CONTENT_DIR/mu-plugins/xt_php_error_log_handle.php

# Comparing logs folders
LOG_DIFF=$( diff -rq $TMP/before $TMP/after )

if [ ! $LOG_DIFF ]; then
	# Restore DB snapshot
	wp db reset --yes
	wp db import $TMP/before.sql
	# @todo how to restore files ?
	echo 'Different log entries detected, upgrade needs manual handling.'
	echo $LOG_DIFF
	exit 1
else
	echo 'Identical log entries found, upgrade was successful.'
	exit 0
fi
