FROM drupal:10-apache

WORKDIR /opt/drupal

USER root

RUN composer require drush/drush --no-interaction --no-progress

COPY install-drupal.sh docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/install-drupal.sh /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["apache2-foreground"]

USER www-data
