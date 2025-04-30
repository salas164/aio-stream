import React, { useState, useEffect } from 'react';
import styles from './CustomFormatter.module.css';

interface CustomFormatterProps {
  setFormatter: (formatter: string) => void;
}

const CustomFormatter: React.FC<CustomFormatterProps> = ({ setFormatter }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [customNameSyntax, setCustomNameSyntax] = useState('');
  const [customDescSyntax, setCustomDescSyntax] = useState('');

  useEffect(() => {
    // If both fields have content, update the formatter
    const formatterData = {
      name: customNameSyntax,
      description: customDescSyntax,
    };
    setFormatter(`custom:${JSON.stringify(formatterData)}`);
  }, [customNameSyntax, customDescSyntax, setFormatter]);

  return (
    <div className={styles.customFormatterContainer}>
      <h3
        className={styles.customFormatterTitle}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        Custom Formatter
        <span className={styles.expandIcon}>{isExpanded ? '▼' : '►'}</span>
      </h3>

      {isExpanded && (
        <div className={styles.customFormatterContent}>
          <p className={styles.customFormatterDescription}>
            Define a custom formatter syntax. Write
            <code>{'{debug.jsonf}'}</code> to see the available variables.
            <br />
            For a more detailed explanation, check the{' '}
            <a href="https://github.com/Viren070/AIOStreams/wiki/Custom-Formatter">
              wiki
            </a>
            <br />
          </p>

          <div className={styles.formGroup}>
            <label className={styles.label}>Name Format:</label>
            <textarea
              className={styles.syntaxInput}
              value={customNameSyntax}
              onChange={(e) => setCustomNameSyntax(e.target.value)}
              placeholder="E.g.: {addon.name}"
              rows={2}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Description Format:</label>
            <textarea
              className={styles.syntaxInput}
              value={customDescSyntax}
              onChange={(e) => setCustomDescSyntax(e.target.value)}
              placeholder="E.g.: {stream.name}"
              rows={3}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomFormatter;
